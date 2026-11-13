"""An HTTP error with a structured JSON body (e.g. {"detail", "code", "attempts_left"}).

FastAPI's HTTPException nests a dict under "detail"; the OTP endpoints need flat bodies the
frontend can branch on, so they raise ApiError and main.py renders it as-is.
"""

from fastapi import Request
from fastapi.responses import JSONResponse


class ApiError(Exception):
    def __init__(self, status_code: int, detail: str, headers: dict[str, str] | None = None, **extra):
        super().__init__(detail)
        self.status_code = status_code
        self.body = {"detail": detail, **extra}
        self.headers = headers


async def api_error_handler(_: Request, exc: ApiError) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content=exc.body, headers=exc.headers)
