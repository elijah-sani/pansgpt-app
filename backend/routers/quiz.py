"""
Quiz router – Generate, submit, and retrieve quizzes.
"""
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional, List
import json
import logging

from services import llm_engine

logger = logging.getLogger("PansGPT")

router = APIRouter(prefix="/api/quiz", tags=["quiz"])

_supabase = None
_verify_api_key = None


def set_dependencies(supabase_client, verify_api_key_fn):
    global _supabase, _verify_api_key
    _supabase = supabase_client
    _verify_api_key = verify_api_key_fn


def _get_supabase():
    if _supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")
    return _supabase


# ---------- Models ----------
class QuizGenerateRequest(BaseModel):
    courseCode: str
    courseTitle: str
    topic: Optional[str] = None
    level: str
    difficulty: str = "medium"
    numQuestions: int = 10
    timeLimit: Optional[int] = None
    questionType: str = "OBJECTIVE"
    userId: str


class AnswerItem(BaseModel):
    questionId: str
    selectedAnswer: str


class QuizSubmitRequest(BaseModel):
    quizId: str
    userId: str
    answers: List[AnswerItem]
    timeTaken: Optional[int] = None


# ---------- Routes ----------

@router.post("/generate")
async def generate_quiz(body: QuizGenerateRequest):
    """Generate quiz questions using LLM and save to database."""
    sb = _get_supabase()

    q_type = getattr(body, "questionType", "OBJECTIVE") or "OBJECTIVE"
    if q_type in ("OBJECTIVE", "multiple_choice", "MCQ"):
        type_desc = "multiple-choice"
        format_reqs = '''- "questionType": "multiple_choice"
- "options": an array of 4 option strings ["A. ...", "B. ...", "C. ...", "D. ..."]
- "correctAnswer": the letter of the correct option (e.g. "A")'''
    elif q_type == "TRUE_FALSE":
        type_desc = "true/false"
        format_reqs = '''- "questionType": "TRUE_FALSE"
- "options": ["True", "False"]
- "correctAnswer": "True" or "False"'''
    elif q_type == "SHORT_ANSWER":
        type_desc = "short answer"
        format_reqs = '''- "questionType": "SHORT_ANSWER"
- "correctAnswer": the exact short phrase or word that answers the question
(Do not include an "options" field)'''
    else:
        type_desc = "multiple-choice"
        format_reqs = '''- "questionType": "multiple_choice"
- "options": an array of 4 option strings ["A. ...", "B. ...", "C. ...", "D. ..."]
- "correctAnswer": the letter of the correct option (e.g. "A")'''

    prompt = f"""Generate {body.numQuestions} {type_desc} quiz questions about {body.courseTitle} ({body.courseCode}).
Topic: {body.topic or 'General'}
Difficulty: {body.difficulty}
Level: {body.level}

Return ONLY a valid JSON array of question objects. Each object must have:
- "questionText": the question string
{format_reqs}
- "explanation": a brief explanation of the correct answer

Do NOT include any markdown, code fences, or extra text. Return ONLY the JSON array."""

    try:
        # Use existing LLM engine, forced to Google Gemma 3 27B
        raw = await llm_engine.generate_response_async(prompt, [], force_google=True)
        
        import re
        
        # Robustly extract JSON array from response
        cleaned = raw.strip()
        
        # Try to find an array bracket block
        match = re.search(r'\[\s*\{.*\}\s*\]', cleaned, re.DOTALL)
        if match:
            cleaned = match.group(0)
        else:
            # Fallback naive cleaning
            if cleaned.startswith("```"):
                cleaned = cleaned.split("\n", 1)[1] if "\n" in cleaned else cleaned[3:]
            if cleaned.endswith("```"):
                cleaned = cleaned[:-3]
            cleaned = cleaned.strip()
            if cleaned.lower().startswith("json"):
                cleaned = cleaned[4:].strip()

        try:
            questions = json.loads(cleaned)
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse JSON from LLM: {cleaned[:200]}...")
            raise HTTPException(status_code=500, detail=f"LLM returned invalid JSON format: {e}")

        if not isinstance(questions, list):
            raise HTTPException(status_code=500, detail="LLM returned JSON but it wasn't an array")

        try:
            # Save quiz to database
            quiz_res = sb.table("quizzes").insert({
                "user_id": body.userId,
                "title": f"{body.courseTitle} - {body.topic or 'General'} Quiz",
                "course_code": body.courseCode,
                "course_title": body.courseTitle,
                "topic": body.topic,
                "level": body.level,
                "difficulty": body.difficulty,
                "num_questions": len(questions),
                "time_limit": body.timeLimit,
            }).execute()

            quiz_id = quiz_res.data[0]["id"]

            # Save questions
            questions_to_insert = []
            for idx, q in enumerate(questions):
                questions_to_insert.append({
                    "quiz_id": quiz_id,
                    "question_text": q["questionText"],
                    "question_type": q.get("questionType", "multiple_choice"),
                    "options": q.get("options"),
                    "correct_answer": q["correctAnswer"],
                    "explanation": q.get("explanation"),
                    "points": 1,
                    "question_order": idx + 1,
                })

            sb.table("quiz_questions").insert(questions_to_insert).execute()
        except Exception as db_err:
            logger.error(f"[ERROR] Quiz DB Insertion Failed: {db_err}")
            raise HTTPException(status_code=500, detail=f"Database error while saving quiz: {db_err}")

        # Return the created quiz
        return await get_quiz(quiz_id)

    except json.JSONDecodeError as e:
        logger.error(f"Quiz generation: JSON parse error: {e}")
        raise HTTPException(status_code=500, detail="Failed to parse AI response into quiz questions")
    except Exception as e:
        logger.error(f"Quiz generation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/history")
async def quiz_history(userId: str, limit: int = 50):
    """Get user's quiz history with results."""
    sb = _get_supabase()
    try:
        # Fetch quizzes
        quiz_res = sb.table("quizzes") \
            .select("*") \
            .eq("user_id", userId) \
            .order("created_at", desc=True) \
            .limit(limit) \
            .execute()

        quizzes = []
        for quiz in (quiz_res.data or []):
            # Get results for this quiz
            result_res = sb.table("quiz_results") \
                .select("*") \
                .eq("quiz_id", quiz["id"]) \
                .eq("user_id", userId) \
                .order("completed_at", desc=True) \
                .limit(1) \
                .execute()

            result = result_res.data[0] if result_res.data else None
            quizzes.append({
                **quiz,
                "result": result,
            })

        return {"quizzes": quizzes}

    except Exception as e:
        logger.error(f"Quiz history error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{quiz_id}")
async def get_quiz(quiz_id: str):
    """Get a quiz with its questions."""
    sb = _get_supabase()
    try:
        quiz_res = sb.table("quizzes") \
            .select("*") \
            .eq("id", quiz_id) \
            .single() \
            .execute()

        if not quiz_res.data:
            raise HTTPException(status_code=404, detail="Quiz not found")

        questions_res = sb.table("quiz_questions") \
            .select("*") \
            .eq("quiz_id", quiz_id) \
            .order("question_order", desc=False) \
            .execute()

        return {
            "quiz": {
                **quiz_res.data,
                "questions": questions_res.data or [],
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get quiz error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/submit")
async def submit_quiz(body: QuizSubmitRequest):
    """Submit quiz answers, calculate score, save result."""
    sb = _get_supabase()
    try:
        # Fetch questions for scoring
        questions_res = sb.table("quiz_questions") \
            .select("*") \
            .eq("quiz_id", body.quizId) \
            .order("question_order", desc=False) \
            .execute()

        questions = {q["id"]: q for q in (questions_res.data or [])}

        score = 0
        max_score = len(questions)
        feedback_items = []

        for answer in body.answers:
            question = questions.get(answer.questionId)
            if not question:
                continue
            ans_str = answer.selectedAnswer.strip().upper()
            corr_str = question["correct_answer"].strip().upper()
            if question.get("question_type") in ("multiple_choice", "MCQ", "OBJECTIVE"):
                is_correct = bool(ans_str and corr_str and ans_str[0] == corr_str[0])
            else:
                is_correct = ans_str == corr_str
            if is_correct:
                score += question.get("points", 1)
            feedback_items.append({
                "questionId": answer.questionId,
                "selectedAnswer": answer.selectedAnswer,
                "correctAnswer": question["correct_answer"],
                "isCorrect": is_correct,
                "explanation": question.get("explanation"),
            })

        percentage = (score / max_score * 100) if max_score > 0 else 0

        # Save result
        result_res = sb.table("quiz_results").insert({
            "quiz_id": body.quizId,
            "user_id": body.userId,
            "answers": [a.dict() for a in body.answers],
            "score": score,
            "max_score": max_score,
            "percentage": round(percentage, 1),
            "time_taken": body.timeTaken,
            "feedback": feedback_items,
        }).execute()

        return {
            "result": result_res.data[0] if result_res.data else None,
            "score": score,
            "maxScore": max_score,
            "percentage": round(percentage, 1),
            "feedback": feedback_items,
        }

    except Exception as e:
        logger.error(f"Quiz submit error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/results/{result_id}")
async def get_quiz_result(result_id: str):
    """Get a specific quiz result."""
    sb = _get_supabase()
    try:
        res = sb.table("quiz_results") \
            .select("*") \
            .eq("id", result_id) \
            .single() \
            .execute()

        if not res.data:
            raise HTTPException(status_code=404, detail="Result not found")

        # Fetch the quiz info too
        quiz_res = sb.table("quizzes") \
            .select("*") \
            .eq("id", res.data["quiz_id"]) \
            .single() \
            .execute()

        return {
            "result": res.data,
            "quiz": quiz_res.data,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get quiz result error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/share/{quiz_id}")
async def share_quiz(quiz_id: str):
    """Get shareable quiz data (public, no auth required)."""
    sb = _get_supabase()
    try:
        quiz_data = await get_quiz(quiz_id)
        
        # Get the best result for this quiz
        result_res = sb.table("quiz_results") \
            .select("*") \
            .eq("quiz_id", quiz_id) \
            .order("percentage", desc=True) \
            .limit(1) \
            .execute()

        return {
            "quiz": quiz_data["quiz"],
            "bestResult": result_res.data[0] if result_res.data else None,
        }

    except Exception as e:
        logger.error(f"Share quiz error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
