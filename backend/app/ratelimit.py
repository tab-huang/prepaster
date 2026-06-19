"""Dependency-free, in-memory rate limiting for the public API.

The API is unauthenticated and several endpoints make *paid / quota-limited*
calls (OpenRouter AI, NASA FIRMS, Overpass). Without throttling, anyone who finds
the URL can script requests and burn the account's credits — effectively stealing
the key's value even though the key string itself never leaves the server.

This middleware applies a sliding-window limit with three layers:

  1. Per-IP, all endpoints      — stops a single client hammering the API.
  2. Per-IP, expensive AI paths — much tighter, since each call costs real money.
  3. GLOBAL, expensive AI paths — a hard ceiling across *all* clients, so even an
     attacker rotating/forging source IPs cannot run the AI budget away; the worst
     they can do is exhaust the shared global allowance (and get 429s).

In-memory means limits are per worker process. The PythonAnywhere deployment runs
a single web worker, so this is effective there; if you ever scale to multiple
workers or hosts, move the counters to Redis/Memcached for a shared view.

No external dependencies — pure stdlib, safe under the single-threaded asyncio
event loop (no awaits between reading and mutating the counters).
"""
from __future__ import annotations

import time
from collections import defaultdict, deque

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

# Endpoints that trigger a paid OpenRouter call (or otherwise expensive work).
# These get the tight per-IP limit and contribute to the global ceiling.
_EXPENSIVE_PATHS = frozenset(
    {"/api/recommend", "/api/analyze_screenshot", "/api/follow-up"}
)

# (max_requests, window_seconds)
_PER_IP_ALL = (90, 60)         # any IP: 90 requests / minute across all endpoints
_PER_IP_EXPENSIVE = (12, 60)   # any IP: 12 AI calls / minute
_GLOBAL_EXPENSIVE = (90, 60)   # everyone combined: 90 AI calls / minute (budget guard)

_GLOBAL_KEY = "__global_ai__"


class _SlidingWindow:
    """Tracks request timestamps per key and answers 'is this key over its limit?'."""

    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def check(self, key: str, limit: int, window: float, now: float) -> float | None:
        """Record a hit for `key`. Returns None if allowed, or the number of seconds
        to wait (Retry-After) if the limit is exceeded."""
        dq = self._hits[key]
        cutoff = now - window
        while dq and dq[0] <= cutoff:
            dq.popleft()
        if len(dq) >= limit:
            # Oldest hit in the window leaves at dq[0] + window.
            return max(1.0, round(dq[0] + window - now, 1))
        dq.append(now)
        return None

    def sweep(self, now: float, max_window: float) -> None:
        """Drop keys with no recent hits so the dict can't grow unbounded."""
        cutoff = now - max_window
        stale = [k for k, dq in self._hits.items() if not dq or dq[-1] <= cutoff]
        for k in stale:
            del self._hits[k]


def _client_ip(request: Request) -> str:
    """Best-effort client IP. PythonAnywhere terminates TLS at a front proxy and
    forwards the real client in X-Forwarded-For / X-Real-IP, so prefer those; fall
    back to the socket peer. (Per-IP limits are best-effort and spoofable — the
    GLOBAL ceiling is the real budget guard, so spoofing IPs doesn't help an
    attacker get past the spend limit.)"""
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    xri = request.headers.get("x-real-ip")
    if xri:
        return xri.strip()
    return request.client.host if request.client else "unknown"


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app) -> None:
        super().__init__(app)
        self._win = _SlidingWindow()
        self._last_sweep = 0.0

    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        # Only guard the API surface; let docs, health, and static pass through.
        if not path.startswith("/api/") or path == "/api/health":
            return await call_next(request)

        now = time.monotonic()
        # Periodically GC stale buckets (at most once a minute).
        if now - self._last_sweep > 60:
            self._win.sweep(now, max_window=120)
            self._last_sweep = now

        ip = _client_ip(request)
        expensive = path in _EXPENSIVE_PATHS

        checks = [(f"ip:{ip}", *_PER_IP_ALL)]
        if expensive:
            checks.append((f"ai:{ip}", *_PER_IP_EXPENSIVE))
            checks.append((_GLOBAL_KEY, *_GLOBAL_EXPENSIVE))

        for key, limit, window in checks:
            retry = self._win.check(key, limit, window, now)
            if retry is not None:
                return JSONResponse(
                    status_code=429,
                    content={
                        "ok": False,
                        "error": "Too many requests — please slow down and try again shortly.",
                    },
                    headers={"Retry-After": str(int(retry))},
                )

        return await call_next(request)
