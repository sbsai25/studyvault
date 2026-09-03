import sys
from backend.database import engine
from backend.models.base import Base
from backend.models.user import User
from backend.models.document import Document
from backend.models.chunk import Chunk
from backend.models.conversation import Conversation, Message
from backend.models.flashcard import FlashcardSet, Flashcard, FlashcardProgress
from backend.models.quiz import Quiz, QuizQuestion, QuizAttempt, QuizAnswer
from backend.models.activity import Activity

Base.metadata.create_all(bind=engine)

print("[OK] Database tables created successfully!")