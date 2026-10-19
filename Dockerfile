# StudyVault API
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UPLOAD_DIR=/data/uploads \
    CHROMA_PATH=/data/chroma

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend ./backend

# Run as a non-root user; uploads and the vector store live on volumes under /data
RUN useradd --create-home appuser \
    && mkdir -p /data/uploads /data/chroma \
    && chown -R appuser:appuser /data
USER appuser

EXPOSE 8000

# Apply additive migrations, then serve. --proxy-headers lets the rate
# limiter see real client IPs when running behind a reverse proxy.
CMD ["sh", "-c", "python -m backend.migrate_db && uvicorn backend.main:app --host 0.0.0.0 --port 8000 --proxy-headers"]
