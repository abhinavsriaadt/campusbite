"""Small in-process sliding-window rate limiter.

Adequate for a single backend process. For horizontally scaled deployments,
swap the storage for Redis (same interface).
"""

import threading
import time
from collections import defaultdict, deque


class SlidingWindowRateLimiter:
    def __init__(self, window_seconds: float = 60.0):
        self.window = window_seconds
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def hit(self, key: str, limit: int) -> tuple[bool, int]:
        """Record a hit. Returns (allowed, retry_after_seconds)."""
        now = time.monotonic()
        with self._lock:
            q = self._hits[key]
            while q and now - q[0] >= self.window:
                q.popleft()
            if len(q) >= limit:
                return False, max(1, int(self.window - (now - q[0])) + 1)
            q.append(now)
            return True, 0

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


def _login_window() -> float:
    from app.core.config import get_settings

    return float(get_settings().LOGIN_RATE_WINDOW_SECONDS)


ai_rate_limiter = SlidingWindowRateLimiter()
# /auth/login, per client IP + email (default 10 attempts per 10 minutes).
login_rate_limiter = SlidingWindowRateLimiter(_login_window())
