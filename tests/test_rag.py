import json
from types import SimpleNamespace
from unittest.mock import patch

import pytest

from backend.services.rag import AIServiceError, generate_flashcards, generate_quiz


def _gemini_returns(payload):
    text = payload if isinstance(payload, str) else json.dumps(payload)
    return patch(
        "backend.services.rag.client.models.generate_content",
        return_value=SimpleNamespace(text=text),
    )


def test_generate_quiz_keeps_valid_items_and_normalises_answer():
    payload = [
        {"question": "Capital of France?", "options": ["Paris", "Rome", "Oslo", "Bern"],
         "correct_answer": "  paris ", "explanation": "Paris is the capital."},
        {"question": "Answer not in options", "options": ["A", "B"], "correct_answer": "C"},
        {"question": "", "options": ["A", "B"], "correct_answer": "A"},
        {"question": "Too few options", "options": ["A", "A"], "correct_answer": "A"},
        "not an object",
    ]
    with _gemini_returns(payload):
        quiz = generate_quiz("context", count=5)

    assert quiz == [{
        "question": "Capital of France?",
        "options": ["Paris", "Rome", "Oslo", "Bern"],
        "correct_answer": "Paris",
        "explanation": "Paris is the capital.",
    }]


def test_generate_quiz_accepts_object_wrapping_a_list_and_caps_count():
    item = {"question": "Q", "options": ["A", "B"], "correct_answer": "A"}
    with _gemini_returns({"questions": [item, item, item]}):
        quiz = generate_quiz("context", count=2)
    assert len(quiz) == 2
    assert quiz[0]["explanation"] is None


def test_generate_flashcards_drops_malformed_items():
    payload = [
        {"question": "What is DNA?", "answer": "Genetic material."},
        {"question": "Missing answer"},
        {"question": "  ", "answer": "blank question"},
    ]
    with _gemini_returns(payload):
        cards = generate_flashcards("context")
    assert cards == [{"question": "What is DNA?", "answer": "Genetic material."}]


def test_invalid_json_raises_ai_service_error():
    with _gemini_returns("not json at all"):
        with pytest.raises(AIServiceError):
            generate_flashcards("context")


def test_api_failure_raises_ai_service_error():
    with patch(
        "backend.services.rag.client.models.generate_content",
        side_effect=RuntimeError("503 from provider"),
    ):
        with pytest.raises(AIServiceError):
            generate_quiz("context")
