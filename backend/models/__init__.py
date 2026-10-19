# Import all models here so that SQLAlchemy's registry can properly resolve string-based relationships
from .base import Base
from .user import User
from .document import Document
from .chunk import Chunk
from .conversation import Conversation, Message
from .flashcard import FlashcardSet, Flashcard, FlashcardProgress
from .fill_blank import FillBlankSet, FillBlankQuestion, FillBlankAttempt
from .activity import Activity
from .refresh_token import RefreshToken

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
    "FillBlankSet",
    "FillBlankQuestion",
    "FillBlankAttempt",
    "Activity",
    "RefreshToken",
]
