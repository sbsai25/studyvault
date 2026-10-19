# Import all models here so that SQLAlchemy's registry can properly resolve string-based relationships
from .base import Base
from .user import User
from .document import Document
from .chunk import Chunk
from .conversation import Conversation, Message
from .flashcard import FlashcardSet, Flashcard, FlashcardProgress
from .quiz import Quiz, QuizQuestion, QuizAttempt, QuizAnswer
from .fill_blank import FillBlankSet, FillBlankQuestion, FillBlankAttempt
from .activity import Activity

__all__ = [
    "Base",
    "User",
    "Document",
    "Chunk",
    "Conversation",
    "Message",
    "FlashcardSet",
    "Flashcard",
    "FlashcardProgress",
    "Quiz",
    "QuizQuestion",
    "QuizAttempt",
    "QuizAnswer",
    "FillBlankSet",
    "FillBlankQuestion",
    "FillBlankAttempt",
    "Activity",
]
