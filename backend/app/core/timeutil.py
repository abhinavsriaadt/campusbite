"""Business-calendar helpers.

Timestamps are stored in UTC, but "today", "this week" and date filters must follow the
restaurant's local calendar (APP_TIMEZONE, e.g. Asia/Kolkata). Otherwise an order placed at
00:30 IST is filed under the previous day.
"""

from datetime import date, datetime, time, timedelta, timezone
from functools import lru_cache
from zoneinfo import ZoneInfo

from app.core.config import get_settings
from app.core.database import utcnow


@lru_cache(maxsize=8)
def _zone(name: str) -> ZoneInfo:
    return ZoneInfo(name)


def app_tz() -> ZoneInfo:
    return _zone(get_settings().APP_TIMEZONE)


def local_now() -> datetime:
    return utcnow().astimezone(app_tz())


def local_today() -> date:
    return local_now().date()


def local_day_start(d: date) -> datetime:
    """UTC instant at which local calendar day `d` begins (DST-safe)."""
    return datetime.combine(d, time.min, tzinfo=app_tz()).astimezone(timezone.utc)


def local_day_end(d: date) -> datetime:
    """UTC instant at which local calendar day `d` ends (exclusive upper bound)."""
    return local_day_start(d + timedelta(days=1))


def to_local_date(dt: datetime) -> date:
    return dt.astimezone(app_tz()).date()


def format_local(dt: datetime, fmt: str = "%Y-%m-%d %H:%M %Z") -> str:
    return dt.astimezone(app_tz()).strftime(fmt)
