import sys
import os
import pytest
from pydantic import ValidationError

# Add backend directory to sys.path so we can import routers.quiz
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from routers.quiz import (
    QuizQuestionModel,
    _parse_tagged_quiz_batch,
    _is_valid_correct_answer,
    _expand_single_select_answer,
    _filter_generated_quiz_questions,
)

def test_quiz_question_model_valid_mcq():
    # Valid MCQ (multiple choice) question
    data = {
        "questionText": "What is the primary mechanism of action of drug X?",
        "questionType": "multiple_choice",
        "options": ["A. Option one", "B. Option two", "C. Option three", "D. Option four"],
        "correctAnswer": "A",
        "explanation": "This is a detailed explanation explaining why A is the correct option."
    }
    model = QuizQuestionModel.model_validate(data)
    assert model.questionText == data["questionText"]
    assert model.questionType == "multiple_choice"
    assert len(model.options) == 4
    assert model.correctAnswer == "A"

def test_quiz_question_model_invalid_mcq_options():
    # MCQ with insufficient options (should raise ValidationError)
    data = {
        "questionText": "What is the primary mechanism of action of drug X?",
        "questionType": "multiple_choice",
        "options": ["A. Option one", "B. Option two"],
        "correctAnswer": "A",
        "explanation": "This is a detailed explanation explaining why A is the correct option."
    }
    with pytest.raises(ValidationError):
        QuizQuestionModel.model_validate(data)

def test_quiz_question_model_valid_mcq_select_multiple():
    # MCQ multi-select question (exactly 5 options)
    data = {
        "questionText": "Select all that apply regarding drug X's side effects. Select one or more.",
        "questionType": "MCQ",
        "options": ["A. Option A", "B. Option B", "C. Option C", "D. Option D", "E. Option E"],
        "correctAnswer": "A, C, E",
        "explanation": "This is a detailed explanation explaining why A, C, E are correct."
    }
    model = QuizQuestionModel.model_validate(data)
    assert len(model.options) == 5
    assert model.correctAnswer == "A, C, E"

def test_quiz_question_model_invalid_mcq_select_multiple_options():
    # MCQ multi-select with 4 options (MCQ type requires exactly 5 options)
    data = {
        "questionText": "Select all that apply regarding drug X's side effects. Select one or more.",
        "questionType": "MCQ",
        "options": ["A. Option A", "B. Option B", "C. Option C", "D. Option D"],
        "correctAnswer": "A, C, E",
        "explanation": "This is a detailed explanation explaining why A, C, E are correct."
    }
    with pytest.raises(ValidationError):
        QuizQuestionModel.model_validate(data)

def test_quiz_question_model_valid_true_false():
    data = {
        "questionText": "Drug X is a competitive antagonist of receptor Y.",
        "questionType": "TRUE_FALSE",
        "options": ["True", "False"],
        "correctAnswer": "True",
        "explanation": "This is a detailed explanation explaining why the statement is True."
    }
    model = QuizQuestionModel.model_validate(data)
    assert len(model.options) == 2
    assert model.correctAnswer == "True"

def test_quiz_question_model_invalid_true_false_options():
    # TRUE_FALSE with 3 options
    data = {
        "questionText": "Drug X is a competitive antagonist of receptor Y.",
        "questionType": "TRUE_FALSE",
        "options": ["True", "False", "Maybe"],
        "correctAnswer": "True",
        "explanation": "This is a detailed explanation explaining why the statement is True."
    }
    with pytest.raises(ValidationError):
        QuizQuestionModel.model_validate(data)

def test_quiz_question_model_valid_short_answer():
    data = {
        "questionText": "What is the clinical term used to describe high blood pressure?",
        "questionType": "SHORT_ANSWER",
        "options": None,
        "correctAnswer": "Hypertension",
        "explanation": "Hypertension is the term for elevated blood pressure."
    }
    model = QuizQuestionModel.model_validate(data)
    assert model.options is None
    assert model.correctAnswer == "Hypertension"

def test_quiz_question_model_invalid_short_answer_with_options():
    # SHORT_ANSWER must not have options
    data = {
        "questionText": "What is the clinical term used to describe high blood pressure?",
        "questionType": "SHORT_ANSWER",
        "options": ["Hypertension", "Hypotension"],
        "correctAnswer": "Hypertension",
        "explanation": "Hypertension is the term for elevated blood pressure."
    }
    with pytest.raises(ValidationError):
        QuizQuestionModel.model_validate(data)

def test_is_valid_correct_answer_mcq():
    options = ["A. Opt 1", "B. Opt 2", "C. Opt 3", "D. Opt 4", "E. Opt 5"]
    assert _is_valid_correct_answer("A, C, E", options, "MCQ") is True
    assert _is_valid_correct_answer("A, F", options, "MCQ") is False
    assert _is_valid_correct_answer("A, C, E", None, "MCQ") is False

def test_is_valid_correct_answer_single_choice():
    options = ["A. Furosemide", "B. Metoprolol", "C. Lisinopril", "D. Amlodipine"]
    # Option index match
    assert _is_valid_correct_answer("A", options, "multiple_choice") is True
    # Normalized option match
    assert _is_valid_correct_answer("Furosemide", options, "multiple_choice") is True
    assert _is_valid_correct_answer("A. Furosemide", options, "multiple_choice") is True
    # Non-matching answer
    assert _is_valid_correct_answer("E", options, "multiple_choice") is False
    assert _is_valid_correct_answer("Propranolol", options, "multiple_choice") is False

def test_is_valid_correct_answer_true_false():
    assert _is_valid_correct_answer("True", ["True", "False"], "TRUE_FALSE") is True
    assert _is_valid_correct_answer("FALSE", ["True", "False"], "TRUE_FALSE") is True
    assert _is_valid_correct_answer("Maybe", ["True", "False"], "TRUE_FALSE") is False

def test_is_valid_correct_answer_short_answer():
    assert _is_valid_correct_answer("Hypertension", None, "SHORT_ANSWER") is True
    assert _is_valid_correct_answer("", None, "SHORT_ANSWER") is False

def test_expand_single_select_answer_returns_full_option_text():
    options = ["A. Capillary viscometer", "B. Rotational viscometer", "C. Falling sphere viscometer", "D. Ostwald viscometer"]
    assert _expand_single_select_answer("B", options) == "B. Rotational viscometer"
    assert _expand_single_select_answer("2", options) == "B. Rotational viscometer"
    assert _expand_single_select_answer("Rotational viscometer", options) == "B. Rotational viscometer"

def test_parse_tagged_quiz_batch_valid_four_option_block():
    raw = """
<question>
TEXT: Which of the following best describes viscosity?
TYPE: multiple_choice
A: Resistance of a fluid to flow
B: Ability of a solid to melt
C: Pressure inside a container
D: Rate of chemical reaction
ANSWER: A
EXPLANATION: Viscosity is the internal resistance of a fluid to flow.
</question>
"""
    questions = _parse_tagged_quiz_batch(raw)
    assert len(questions) == 1
    assert questions[0]["correctAnswer"] == "A"
    assert len(questions[0]["options"]) == 4


def test_parse_tagged_quiz_batch_valid_five_option_block():
    raw = """
<question>
TEXT: Which factor can directly increase apparent viscosity in a suspension?
TYPE: MCQ
A: Higher particle concentration
B: Lower molecular interaction
C: Complete absence of dispersed phase
D: Lower resistance to flow
E: No change in shear conditions
ANSWER: A,C,E
EXPLANATION: Higher particle concentration, lower resistance to flow, and altered shear behavior can be correct depending on the formulation context given.
</question>
"""
    questions = _parse_tagged_quiz_batch(raw)
    assert len(questions) == 1
    assert questions[0]["questionType"] == "MCQ"
    assert len(questions[0]["options"]) == 5
    assert questions[0]["correctAnswer"] == "A, C, E"


def test_parse_tagged_quiz_batch_valid_true_false_block():
    raw = """
<question>
TEXT: Oxytocin is commonly used to stimulate uterine contractions during labour.
TYPE: TRUE_FALSE
ANSWER: True
EXPLANATION: Oxytocin is used clinically to induce or augment labour because it stimulates uterine contractions.
</question>
"""
    questions = _parse_tagged_quiz_batch(raw)
    assert len(questions) == 1
    assert questions[0]["questionType"] == "TRUE_FALSE"
    assert questions[0]["options"] == ["True", "False"]
    assert questions[0]["correctAnswer"] == "True"


def test_parse_tagged_quiz_batch_valid_short_answer_block():
    raw = """
<question>
TEXT: What hormone is primarily associated with milk let-down?
TYPE: SHORT_ANSWER
ANSWER: Oxytocin
EXPLANATION: Oxytocin is the hormone responsible for milk ejection or let-down.
</question>
"""
    questions = _parse_tagged_quiz_batch(raw)
    assert len(questions) == 1
    assert questions[0]["questionType"] == "SHORT_ANSWER"
    assert questions[0]["options"] is None
    assert questions[0]["correctAnswer"] == "Oxytocin"


def test_parse_tagged_quiz_batch_accepts_safe_label_variants():
    raw = """
<question>
Question Text: Which statement best describes viscosity in liquid dosage forms?
Question Type: multiple_choice
Option A: Resistance of a liquid to flow
Option B: Tendency of a powder to sublime
Option C: Ability of a salt to ionize
Option D: Pressure inside a sealed vessel
Correct Answer: A
Rationale: Viscosity describes internal resistance to flow, which affects pouring and formulation handling.
</question>
"""
    questions = _parse_tagged_quiz_batch(raw)
    assert len(questions) == 1
    assert questions[0]["questionType"] == "multiple_choice"
    assert questions[0]["correctAnswer"] == "A"
    assert len(questions[0]["options"]) == 4


def test_parse_tagged_quiz_batch_accepts_multiline_explanation_continuation():
    raw = """
<question>
TEXT: Why is viscosity important in pharmaceutical suspensions?
TYPE: multiple_choice
A: It affects pourability and physical stability
B: It determines radioactive decay rate
C: It prevents all microbial contamination
D: It replaces the need for preservatives
ANSWER: A
EXPLANATION: Viscosity affects how easily a suspension pours.
It can also influence sedimentation and redispersion behavior.
</question>
"""
    questions = _parse_tagged_quiz_batch(raw)
    assert len(questions) == 1
    assert "sedimentation" in questions[0]["explanation"]


def test_parse_tagged_quiz_batch_multiple_valid_blocks():
    raw = """
<question>
TEXT: Which term describes resistance of a liquid to flow?
TYPE: multiple_choice
A: Viscosity
B: Sublimation
C: Ionization
D: Crystallization
ANSWER: A
EXPLANATION: Viscosity describes the internal resistance of a liquid to flow.
</question>
<question>
TEXT: Which instrument is commonly used to measure viscosity?
TYPE: multiple_choice
A: Viscometer
B: Colorimeter
C: Thermocycler
D: Spirometer
ANSWER: A
EXPLANATION: A viscometer is used to measure the viscosity of liquids.
</question>
"""
    questions = _parse_tagged_quiz_batch(raw)
    assert len(questions) == 2


def test_parse_tagged_quiz_batch_partial_valid_blocks():
    raw = """
<question>
TEXT: Which term describes resistance of a liquid to flow?
TYPE: multiple_choice
A: Viscosity
B: Sublimation
C: Ionization
D: Crystallization
ANSWER: A
EXPLANATION: Viscosity describes the internal resistance of a liquid to flow.
</question>
<question>
TEXT: Bad?
TYPE: multiple_choice
A: Only one option
ANSWER: A
EXPLANATION: Too weak
</question>
"""
    questions = _parse_tagged_quiz_batch(raw)
    assert len(questions) == 1
    assert questions[0]["questionText"].startswith("Which term")


def test_parse_tagged_quiz_batch_missing_answer():
    raw = """
<question>
TEXT: Which term describes resistance of a liquid to flow?
TYPE: multiple_choice
A: Viscosity
B: Sublimation
C: Ionization
D: Crystallization
EXPLANATION: Viscosity describes the internal resistance of a liquid to flow.
</question>
"""
    with pytest.raises(ValueError, match="tagged_no_valid_blocks"):
        _parse_tagged_quiz_batch(raw)


def test_parse_tagged_quiz_batch_answer_letter_not_present():
    raw = """
<question>
TEXT: Which term describes resistance of a liquid to flow?
TYPE: multiple_choice
A: Viscosity
B: Sublimation
C: Ionization
D: Crystallization
ANSWER: E
EXPLANATION: Viscosity describes the internal resistance of a liquid to flow.
</question>
"""
    with pytest.raises(ValueError, match="tagged_no_valid_blocks"):
        _parse_tagged_quiz_batch(raw)


def test_parse_tagged_quiz_batch_duplicate_options():
    raw = """
<question>
TEXT: Which term describes resistance of a liquid to flow?
TYPE: multiple_choice
A: Viscosity
B: Viscosity
C: Ionization
D: Crystallization
ANSWER: A
EXPLANATION: Viscosity describes the internal resistance of a liquid to flow.
</question>
"""
    with pytest.raises(ValueError, match="tagged_no_valid_blocks"):
        _parse_tagged_quiz_batch(raw)


def test_parse_tagged_quiz_batch_missing_explanation():
    raw = """
<question>
TEXT: Which term describes resistance of a liquid to flow?
TYPE: multiple_choice
A: Viscosity
B: Sublimation
C: Ionization
D: Crystallization
ANSWER: A
</question>
"""
    with pytest.raises(ValueError, match="tagged_no_valid_blocks"):
        _parse_tagged_quiz_batch(raw)


def test_parse_tagged_quiz_batch_true_false_rejects_options():
    raw = """
<question>
TEXT: Oxytocin is used to stimulate uterine contractions.
TYPE: TRUE_FALSE
A: True
B: False
ANSWER: True
EXPLANATION: Oxytocin stimulates uterine contractions.
</question>
"""
    with pytest.raises(ValueError, match="tagged_no_valid_blocks"):
        _parse_tagged_quiz_batch(raw)


def test_parse_tagged_quiz_batch_short_answer_rejects_options():
    raw = """
<question>
TEXT: What hormone is primarily associated with milk let-down?
TYPE: SHORT_ANSWER
A: Oxytocin
B: Prolactin
ANSWER: Oxytocin
EXPLANATION: Oxytocin is responsible for milk ejection.
</question>
"""
    with pytest.raises(ValueError, match="tagged_no_valid_blocks"):
        _parse_tagged_quiz_batch(raw)


def test_parse_tagged_quiz_batch_extra_text_does_not_break_blocks():
    raw = """
Here are the questions:
<question>
TEXT: Which term describes resistance of a liquid to flow?
TYPE: multiple_choice
A: Viscosity
B: Sublimation
C: Ionization
D: Crystallization
ANSWER: A
EXPLANATION: Viscosity describes the internal resistance of a liquid to flow.
</question>
End.
"""
    questions = _parse_tagged_quiz_batch(raw)
    assert len(questions) == 1


def test_parse_tagged_quiz_batch_empty_response():
    with pytest.raises(ValueError, match="LLM returned empty response"):
        _parse_tagged_quiz_batch("")


def test_parse_tagged_quiz_batch_malformed_closing_tag():
    raw = """
<question>
TEXT: Which term describes resistance of a liquid to flow?
TYPE: multiple_choice
A: Viscosity
B: Sublimation
C: Ionization
D: Crystallization
ANSWER: A
EXPLANATION: Viscosity describes the internal resistance of a liquid to flow.
"""
    with pytest.raises(ValueError, match="no complete <question> blocks"):
        _parse_tagged_quiz_batch(raw)


def _quiz_filter_candidate(text, *, answer="A", options=None):
    return {
        "questionText": text,
        "questionType": "multiple_choice",
        "options": options or [
            "A. Viscosity",
            "B. Sublimation",
            "C. Ionization",
            "D. Crystallization",
        ],
        "correctAnswer": answer,
        "explanation": "This explanation is detailed enough to validate the generated question.",
    }


def test_filter_generated_quiz_questions_keeps_partial_valid_batch():
    parsed = [
        _quiz_filter_candidate("Which term describes resistance of a liquid to flow?"),
        _quiz_filter_candidate("Which instrument is commonly used to measure fluid viscosity in the laboratory?"),
    ]
    accepted, stats = _filter_generated_quiz_questions(
        parsed,
        already_used=[],
        recent_questions=["Which term describes resistance of a liquid to flow?"],
        requested_question_type="multiple_choice",
    )

    assert len(accepted) == 1
    assert accepted[0]["questionText"].startswith("Which instrument")
    assert stats["rejected_recent_duplicate_count"] == 1


def test_filter_generated_quiz_questions_rejects_current_quiz_duplicates():
    parsed = [
        _quiz_filter_candidate("Which term describes resistance of a liquid to flow?"),
    ]
    accepted, stats = _filter_generated_quiz_questions(
        parsed,
        already_used=["Which term describes resistance of a liquid to flow?"],
        recent_questions=[],
        requested_question_type="multiple_choice",
    )

    assert accepted == []
    assert stats["rejected_in_quiz_duplicate_count"] == 1


def test_filter_generated_quiz_questions_preserves_quality_validation():
    parsed = [
        _quiz_filter_candidate(
            "Which term describes resistance of a liquid to flow?",
            answer="E",
            options=["A. Viscosity", "B. Sublimation", "C. Ionization", "D. Crystallization"],
        ),
    ]
    accepted, stats = _filter_generated_quiz_questions(
        parsed,
        already_used=[],
        recent_questions=[],
        requested_question_type="multiple_choice",
    )

    assert accepted == []
    assert stats["rejected_quality_count"] == 1
