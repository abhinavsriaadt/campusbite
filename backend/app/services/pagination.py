import math

from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session


def paginate(db: Session, stmt: Select, page: int, page_size: int, *, scalars: bool = True):
    """Run a paginated query. Returns (rows, total, pages)."""
    total = db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    paged = stmt.limit(page_size).offset((page - 1) * page_size)
    rows = list(db.scalars(paged).unique()) if scalars else list(db.execute(paged))
    pages = max(1, math.ceil(total / page_size)) if page_size else 1
    return rows, total, pages


def page_response(items, total: int, page: int, page_size: int, pages: int) -> dict:
    return {"items": items, "total": total, "page": page, "page_size": page_size, "pages": pages}
