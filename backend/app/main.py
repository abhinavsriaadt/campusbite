import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.api.routers import ai, auth, delivery, orders, owner, restaurants, returns
from app.core.config import get_settings
from app.core.database import engine
from app.core.middleware import RequestContextMiddleware, SecurityHeadersMiddleware
from app.services.reminder_service import reminder_loop

settings = get_settings()

logging.basicConfig(
    level=settings.LOG_LEVEL.upper(),
    format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
)
logger = logging.getLogger("campusbite")


@asynccontextmanager
async def lifespan(app: FastAPI):
    stop = asyncio.Event()
    task = None
    if settings.ENABLE_REMINDER_SCHEDULER:
        task = asyncio.create_task(reminder_loop(stop))
    logger.info("CampusBite API started (env=%s, ai_enabled=%s)", settings.ENVIRONMENT, bool(settings.OPENAI_API_KEY))
    yield
    stop.set()
    if task:
        await task


app = FastAPI(
    title=settings.APP_NAME,
    version="1.0.0",
    description=(
        "REST API for **CampusBite** — restaurant ordering & delivery.\n\n"
        "Authenticate with `POST /api/auth/login`, then click **Authorize** and paste the `access_token`."
    ),
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# Order matters: last added = outermost. Request logging wraps everything.
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
    expose_headers=["X-Request-ID", "X-Process-Time", "Retry-After"],
)
app.add_middleware(RequestContextMiddleware)

API_PREFIX = "/api"
for r in (auth, restaurants, orders, returns, owner, delivery, ai):
    app.include_router(r.router, prefix=API_PREFIX)


@app.get("/health", tags=["Health"])
def health():
    """Liveness + database check. Returns 503 when the database is unreachable so the
    Docker healthcheck (and any load balancer) marks the backend unhealthy."""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception:
        logger.exception("Health check: database unreachable")
        return JSONResponse(status_code=503, content={"status": "degraded", "database": "down"})
    return {"status": "ok", "database": "up"}


@app.get("/", include_in_schema=False)
def root():
    return {"name": settings.APP_NAME, "docs": "/docs", "health": "/health"}
