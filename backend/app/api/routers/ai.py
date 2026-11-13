from fastapi import APIRouter, HTTPException, status

from app.api.deps import CustomerUser, DbSession
from app.core.config import get_settings
from app.core.rate_limit import ai_rate_limiter
from app.schemas import AIInsightRequest, AIInsightResponse, AIStatus
from app.services import ai_service

router = APIRouter(prefix="/ai", tags=["AI Order Insights"])


@router.get("/status", response_model=AIStatus)
def ai_status(_: CustomerUser):
    s = get_settings()
    return AIStatus(
        enabled=ai_service.is_enabled(),
        model=s.OPENAI_MODEL if ai_service.is_enabled() else None,
        rate_limit_per_minute=s.AI_RATE_LIMIT_PER_MINUTE,
    )


@router.post("/insights", response_model=AIInsightResponse)
def order_insights(data: AIInsightRequest, customer: CustomerUser, db: DbSession):
    """Ask a natural-language question about *your own* order history."""
    allowed, retry_after = ai_rate_limiter.hit(f"ai:{customer.id}", get_settings().AI_RATE_LIMIT_PER_MINUTE)
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"You're asking too quickly. Please wait {retry_after}s and try again.",
            headers={"Retry-After": str(retry_after)},
        )
    return ai_service.generate_insight(db, customer, data.question)
