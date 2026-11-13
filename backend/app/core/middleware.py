"""Request-level middleware: request IDs, access logging and response-time measurement."""

import logging
import time
import uuid

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger("campusbite.http")


class RequestContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get("X-Request-ID") or uuid.uuid4().hex[:12]
        request.state.request_id = request_id
        start = time.perf_counter()
        try:
            response = await call_next(request)
        except Exception:
            elapsed_ms = (time.perf_counter() - start) * 1000
            logger.exception("%s %s -> 500 (%.1fms) rid=%s", request.method, request.url.path, elapsed_ms, request_id)
            response = JSONResponse(status_code=500, content={"detail": "Internal server error", "request_id": request_id})
            response.headers["X-Request-ID"] = request_id
            return response

        elapsed_ms = (time.perf_counter() - start) * 1000
        response.headers["X-Request-ID"] = request_id
        response.headers["X-Process-Time-Ms"] = f"{elapsed_ms:.1f}"
        level = logging.WARNING if elapsed_ms > 1000 else logging.INFO
        logger.log(
            level, "%s %s -> %s (%.1fms) rid=%s",
            request.method, request.url.path, response.status_code, elapsed_ms, request_id,
        )
        return response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        return response
