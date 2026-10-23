import sys
from backend.database import create_vector_extension, engine
from backend.models.base import Base
from backend.models.user import User
from backend.models.document import Document
from backend.models.chunk import Chunk
from backend.models.conversation import Conversation, Message
from backend.models.flashcard import FlashcardSet, Flashcard, FlashcardProgress
from backend.models.fill_blank import FillBlankSet, FillBlankQuestion, FillBlankAttempt
from backend.models.activity import Activity
from backend.models.refresh_token import RefreshToken

with engine.begin() as conn:
    create_vector_extension(conn)
Base.metadata.create_all(bind=engine)

print("[OK] Database tables created successfully!")