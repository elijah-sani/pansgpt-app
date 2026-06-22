import sys
import os
import pytest
from pydantic import ValidationError

# Add backend directory to sys.path so we can import routers.quiz
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from routers.quiz import (
    QuizQuestionModel,
    QuizBatchModel,
    _parse_quiz_batch,
    _parse_tagged_quiz_batch,
    _is_valid_correct_answer
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

def test_parse_quiz_batch_valid():
    raw_json = """
    {
      "questions": [
        {
          "questionText": "What is the generic name of Lasix?",
          "questionType": "multiple_choice",
          "options": ["A. Furosemide", "B. Metoprolol", "C. Lisinopril", "D. Amlodipine"],
          "correctAnswer": "A",
          "explanation": "Lasix is a brand name for furosemide, a loop diuretic."
        }
      ]
    }
    """
    questions = _parse_quiz_batch(raw_json)
    assert len(questions) == 1
    assert questions[0]["questionText"] == "What is the generic name of Lasix?"

def test_parse_quiz_batch_repaired_json():
    # Malformed JSON with trailing comma, missing closing bracket, and raw markdown wrap
    raw_malformed = """
    ```json
    {
      "questions": [
        {
          "questionText": "What is the generic name of Lasix?",
          "questionType": "multiple_choice",
          "options": ["A. Furosemide", "B. Metoprolol", "C. Lisinopril", "D. Amlodipine"],
          "correctAnswer": "A",
          "explanation": "Lasix is a brand name for furosemide, a loop diuretic.",
        }
      ]
    }
    ```
    """
    # json-repair should fix this malformed JSON and produce a valid parsed list of questions
    questions = _parse_quiz_batch(raw_malformed)
    assert len(questions) == 1
    assert questions[0]["questionText"] == "What is the generic name of Lasix?"

def test_parse_quiz_batch_raw_array_fallback():
    # If the LLM returned a raw list instead of the top-level questions wrapper
    raw_array = """
    [
      {
        "questionText": "What is the generic name of Lasix?",
        "questionType": "multiple_choice",
        "options": ["A. Furosemide", "B. Metoprolol", "C. Lisinopril", "D. Amlodipine"],
        "correctAnswer": "A",
        "explanation": "Lasix is a brand name for furosemide, a loop diuretic."
      }
    ]
    """
    questions = _parse_quiz_batch(raw_array)
    assert len(questions) == 1
    assert questions[0]["questionText"] == "What is the generic name of Lasix?"

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

def test_inline_schema_defs():
    from routers.quiz import _inline_schema_defs
    schema = {
        "title": "TestSchema",
        "type": "object",
        "properties": {
            "questions": {
                "type": "array",
                "items": {
                    "$ref": "#/$defs/QuizQuestion"
                }
            }
        },
        "$defs": {
            "QuizQuestion": {
                "type": "object",
                "properties": {
                    "text": {"type": "string"}
                }
            }
        }
    }
    inlined = _inline_schema_defs(schema)
    assert "$defs" not in inlined
    assert "$ref" not in str(inlined)
    assert inlined["properties"]["questions"]["items"]["properties"]["text"]["type"] == "string"

def test_parse_quiz_batch_empty_response():
    with pytest.raises(ValueError, match="LLM returned empty response"):
        _parse_quiz_batch("")
    with pytest.raises(ValueError, match="LLM returned empty response"):
        _parse_quiz_batch("   ")


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
TYPE: multiple_choice
A: Higher particle concentration
B: Lower molecular interaction
C: Complete absence of dispersed phase
D: Lower resistance to flow
E: No change in shear conditions
ANSWER: A
EXPLANATION: Higher particle concentration can increase internal resistance and raise apparent viscosity.
</question>
"""
    questions = _parse_tagged_quiz_batch(raw)
    assert len(questions) == 1
    assert len(questions[0]["options"]) == 5


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
