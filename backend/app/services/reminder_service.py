"""Background job: remind restaurant owners about orders stuck in PLACED/ACCEPTED."""

import asyncio
import logging
from datetime import timedelta

from sqlalchemy import and_, exists, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import SessionLocal, utcnow
from app.models import AdminReminderLog, Order, OrderStatus

logger = logging.getLogger("campusbite.reminders")

STALE_STATUSES = (OrderStatus.PLACED, OrderStatus.ACCEPTED)


def generate_reminders(db: Session, threshold_minutes: int | None = None, restaurant_id: int | None = None) -> int:
    """Create one open reminder per stale (order, status) pair. Idempotent. Returns number created."""
    threshold = threshold_minutes if threshold_minutes is not None else get_settings().REMINDER_THRESHOLD_MINUTES
    now = utcnow()
    cutoff = now - timedelta(minutes=threshold)

    # One reminder per (order, status) ever: the lifecycle never revisits a status, and a
    # reminder the owner dismissed must not be recreated on the next tick.
    already_reminded = exists().where(
        and_(
            AdminReminderLog.order_id == Order.id,
            AdminReminderLog.order_status == Order.status,
        )
    )
    stmt = select(Order).where(
        Order.status.in_(STALE_STATUSES),
        Order.status_updated_at <= cutoff,
        ~already_reminded,
    )
    if restaurant_id is not None:
        stmt = stmt.where(Order.restaurant_id == restaurant_id)

    created = 0
    for order in list(db.scalars(stmt)):
        minutes = int((now - order.status_updated_at).total_seconds() // 60)
        action = "accept or reject it" if order.status == OrderStatus.PLACED else "start preparing it"
        try:
            # Savepoint per row: if a concurrent run already inserted this reminder, the
            # unique constraint rejects only this row and the rest of the batch proceeds.
            with db.begin_nested():
                db.add(
                    AdminReminderLog(
                        order_id=order.id,
                        restaurant_id=order.restaurant_id,
                        order_status=order.status,
                        minutes_pending=minutes,
                        message=f"Order #{order.id} has been {order.status.value} for {minutes} minutes — please {action}.",
                    )
                )
            created += 1
        except IntegrityError:
            logger.debug("Reminder for order %s/%s already exists", order.id, order.status.value)
    if created:
        db.commit()
    return created


def _run_once() -> int:
    with SessionLocal() as db:
        return generate_reminders(db)


async def reminder_loop(stop_event: asyncio.Event) -> None:
    interval = get_settings().REMINDER_CHECK_INTERVAL_SECONDS
    logger.info("Reminder scheduler started (interval=%ss, threshold=%sm)", interval,
                get_settings().REMINDER_THRESHOLD_MINUTES)
    while not stop_event.is_set():
        try:
            created = await asyncio.to_thread(_run_once)
            if created:
                logger.info("Generated %d order reminder(s)", created)
        except Exception:  # never let the scheduler die
            logger.exception("Reminder job failed")
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=interval)
        except TimeoutError:
            pass
    logger.info("Reminder scheduler stopped")
