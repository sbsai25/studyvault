import psycopg
import os
from dotenv import load_dotenv

load_dotenv()
db_url = os.getenv('DATABASE_URL').replace('postgresql+psycopg://', 'postgresql://')

with psycopg.connect(db_url) as conn:
    with conn.cursor() as cur:
        cur.execute("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            ORDER BY table_name;
        """)
        tables = [row[0] for row in cur.fetchall()]
        print('Tables:', tables)
        
        cur.execute("""
            SELECT conname, pg_get_constraintdef(c.oid)
            FROM pg_constraint c
            JOIN pg_namespace n ON n.oid = c.connamespace
            WHERE c.conrelid = 'flashcard_progress'::regclass;
        """)
        print('FlashcardProgress Constraints:', cur.fetchall())
        
        # Verify counts
        cur.execute("SELECT count(*) FROM users;")
        print("Users count:", cur.fetchone()[0])
        cur.execute("SELECT count(*) FROM documents;")
        print("Documents count:", cur.fetchone()[0])
        cur.execute("SELECT count(*) FROM conversations;")
        print("Conversations count:", cur.fetchone()[0])
