import math
import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request


class RateLimiter:
    """Sliding-window limit per client IP and route, used as a dependency.

    State lives in this process's memory: each API worker or container keeps
    its own counts, and they reset on restart. Behind a reverse proxy every
    request may share the proxy's IP, so configure the proxy to forward the
    client address (e.g. uvicorn --proxy-headers) before relying on it.
    """

    def __init__(self, max_requests: int, window_seconds: float):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._hits: dict[tuple[str, str], deque] = defaultdict(deque)
        self._lock = threading.Lock()

    def __call__(self, request: Request):
        client_ip = request.client.host if request.client else "unknown"
        key = (client_ip, request.url.path)
        now = time.monotonic()

        with self._lock:
            hits = self._hits[key]
            while hits and hits[0] <= now - self.window_seconds:
                hits.popleft()
            if len(hits) >= self.max_requests:
                retry_after = math.ceil(hits[0] + self.window_seconds - now)
                raise HTTPException(
                    status_code=429,
                    detail="Too many requests. Please try again later.",
                    headers={"Retry-After": str(max(retry_after, 1))},
                )
            hits.append(now)

    def reset(self):
        with self._lock:
            self._hits.clear()


# Login and register: 5 attempts per minute per IP (each route counted separately)
auth_rate_limit = RateLimiter(max_requests=5, window_seconds=60)
# Token refresh: 20 per minute per IP
refresh_rate_limit = RateLimiter(max_requests=20, window_seconds=60)


def reset_rate_limits():
    auth_rate_limit.reset()
    refresh_rate_limit.reset()
