# StudyVault API
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UPLOAD_DIR=/data/uploads

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend ./backend

# Run as a non-root user. Uploaded files are only read once, to extract their
# text, so /data/uploads doesn't need to outlive the container; all lasting
# data (including the chunk vectors) is in PostgreSQL.
RUN useradd --create-home appuser \
    && mkdir -p /data/uploads \
    && chown -R appuser:appuser /data
USER appuser

EXPOSE 8000

# Apply additive migrations, then serve on $PORT (set by the host; 8000
# otherwise). --proxy-headers lets the rate limiter see real client IPs
# behind a reverse proxy; uvicorn trusts the proxies listed in the
# FORWARDED_ALLOW_IPS env var (default 127.0.0.1).
CMD ["sh", "-c", "python -m backend.migrate_db && uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers"]
