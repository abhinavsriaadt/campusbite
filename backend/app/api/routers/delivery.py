"""Delivery-partner specific endpoints (order listing/updates go through /orders, scoped by role)."""

from fastapi import APIRouter
from sqlalchemy import func, select

from app.api.deps import DbSession, PartnerUser
from app.core.timeutil import local_day_start, local_today
from app.models import Order, OrderStatus
from app.schemas import DeliveryStats
from app.services.order_service import ACTIVE_STATUSES

router = APIRouter(prefix="/delivery", tags=["Delivery Partner"])


@router.get("/stats", response_model=DeliveryStats)
def delivery_stats(partner: PartnerUser, db: DbSession):
    today = local_day_start(local_today())
    base = select(func.count()).select_from(Order).where(Order.delivery_partner_id == partner.id)
    return DeliveryStats(
        active=db.scalar(base.where(Order.status.in_(ACTIVE_STATUSES))) or 0,
        delivered_total=db.scalar(base.where(Order.status.in_([OrderStatus.DELIVERED, OrderStatus.REFUNDED]))) or 0,
        delivered_today=db.scalar(base.where(Order.delivered_at >= today)) or 0,
    )
