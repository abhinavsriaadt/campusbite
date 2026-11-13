"""Return / refund requests: customers list their own; owners list and resolve their restaurant's."""

from typing import Annotated

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import joinedload

from app.api.deps import CurrentUser, DbSession, OwnerRestaurant, OwnerUser, PageParams
from app.core.database import utcnow
from app.models import Order, ReturnRequest, ReturnStatus, UserRole
from app.schemas import Page, ReturnDecision, ReturnOut
from app.services import order_service as svc
from app.services.pagination import page_response, paginate

router = APIRouter(prefix="/returns", tags=["Returns & Refunds"])


def _out(r: ReturnRequest) -> dict:
    return {
        "id": r.id,
        "order_id": r.order_id,
        "status": r.status,
        "reason": r.reason,
        "resolution_note": r.resolution_note,
        "created_at": r.created_at,
        "resolved_at": r.resolved_at,
        "customer_name": r.customer.name,
        "order_total": r.order.total_amount,
        "order_status": r.order.status,
        "payment_status": r.order.payment_status,
    }


@router.get("", response_model=Page[ReturnOut])
def list_returns(
    user: CurrentUser,
    db: DbSession,
    pg: PageParams,
    status_: Annotated[ReturnStatus | None, Query(alias="status")] = None,
):
    stmt = select(ReturnRequest).options(joinedload(ReturnRequest.order), joinedload(ReturnRequest.customer))
    if user.role == UserRole.CUSTOMER:
        stmt = stmt.where(ReturnRequest.customer_id == user.id)
    elif user.role == UserRole.RESTAURANT_OWNER:
        if user.restaurant is None:
            raise HTTPException(status_code=404, detail="No restaurant linked to this account")
        stmt = stmt.where(ReturnRequest.restaurant_id == user.restaurant.id)
    else:
        raise HTTPException(status_code=403, detail="You do not have permission to view return requests")
    if status_:
        stmt = stmt.where(ReturnRequest.status == status_)
    stmt = stmt.order_by(ReturnRequest.created_at.desc())
    rows, total, pages = paginate(db, stmt, pg.page, pg.page_size)
    return page_response([_out(r) for r in rows], total, pg.page, pg.page_size, pages)


def _pending_request(db, restaurant, return_id: int) -> ReturnRequest:
    rr = db.scalar(select(ReturnRequest).where(ReturnRequest.id == return_id).with_for_update())
    if rr is None or rr.restaurant_id != restaurant.id:
        raise HTTPException(status_code=404, detail="Return request not found")
    if rr.status != ReturnStatus.PENDING:
        raise HTTPException(status_code=409, detail=f"This request has already been {rr.status.value}")
    return rr


def _reload(db, rid: int) -> dict:
    db.expire_all()
    rr = db.scalar(
        select(ReturnRequest)
        .where(ReturnRequest.id == rid)
        .options(joinedload(ReturnRequest.order), joinedload(ReturnRequest.customer))
    )
    return _out(rr)


@router.post("/{return_id}/approve", response_model=ReturnOut)
def approve(return_id: int, data: ReturnDecision, owner: OwnerUser, restaurant: OwnerRestaurant, db: DbSession):
    rr = _pending_request(db, restaurant, return_id)
    order = db.scalar(select(Order).where(Order.id == rr.order_id).with_for_update())
    svc.transition(db, order, svc.S.REFUNDED, owner, "Return approved")
    svc.record_refund(db, order, f"Refund for approved return #{rr.id}")
    rr.status = ReturnStatus.APPROVED
    rr.resolution_note = data.note
    rr.resolved_by_id = owner.id
    rr.resolved_at = utcnow()
    db.commit()
    return _reload(db, rr.id)


@router.post("/{return_id}/reject", response_model=ReturnOut)
def reject(return_id: int, data: ReturnDecision, owner: OwnerUser, restaurant: OwnerRestaurant, db: DbSession):
    rr = _pending_request(db, restaurant, return_id)
    rr.status = ReturnStatus.REJECTED
    rr.resolution_note = data.note
    rr.resolved_by_id = owner.id
    rr.resolved_at = utcnow()
    db.commit()
    return _reload(db, rr.id)
