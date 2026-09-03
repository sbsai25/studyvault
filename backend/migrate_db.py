import sys
import os
from sqlalchemy import text
from backend.database import engine
from backend.models.base import Base

# Import all models to ensure they are registered with Base.metadata
from backend.models.user import User
from backend.models.document import Document
from backend.models.chunk import Chunk
from backend.models.conversation import Conversation, Message
from backend.models.flashcard import FlashcardSet, Flashcard, FlashcardProgress
from backend.models.quiz import Quiz, QuizQuestion, QuizAttempt, QuizAnswer
from backend.models.activity import Activity

def safe_migrate():
    print("Starting safe migration...")
    
    with engine.connect() as conn:
        try:
            # Check if updated_at column exists in conversations table
            result = conn.execute(text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name='conversations' and column_name='updated_at';
            """))
            if not result.fetchone():
                print("Adding updated_at column to conversations table...")
                conn.execute(text("ALTER TABLE conversations ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;"))
                conn.commit()
            else:
                print("Column updated_at already exists on conversations.")
        except Exception as e:
            print(f"Warning during ALTER TABLE conversations: {e}")
            
        try:
            # Check if is_active column exists in users table
            result = conn.execute(text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name='users' and column_name='is_active';
            """))
            if not result.fetchone():
                print("Adding is_active column to users table...")
                conn.execute(text("ALTER TABLE users ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE;"))
                conn.commit()
            else:
                print("Column is_active already exists on users.")
        except Exception as e:
            print(f"Warning during ALTER TABLE users: {e}")

    print("Creating any missing tables...")
    # create_all is safe, it will not drop or alter existing tables, only create missing ones
    Base.metadata.create_all(bind=engine)
    
    print("[OK] Safe migration completed successfully!")

if __name__ == "__main__":
    safe_migrate()
