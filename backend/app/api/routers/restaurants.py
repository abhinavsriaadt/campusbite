"""Public catalogue: restaurants, menus, dish search and reviews (any authenticated or anonymous user)."""

from decimal import Decimal
from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import or_, select
from sqlalchemy.orm import joinedload

from app.api.deps import DbSession, PageParams
from app.models import MenuItem, Restaurant, Review
from app.schemas import DishSearchOut, MenuItemOut, Page, RestaurantDetailOut, RestaurantOut, ReviewOut
from app.services.pagination import page_response, paginate

router = APIRouter(tags=["Restaurants & Menus"])


def _like(term: str) -> str:
    escaped = term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


MenuSort = Literal["name", "price_asc", "price_desc", "newest"]


def _menu_filters(stmt, q, min_price, max_price, category, veg_only, available_only):
    if q:
        stmt = stmt.where(
            or_(MenuItem.name.ilike(_like(q), escape="\\"), MenuItem.description.ilike(_like(q), escape="\\"))
        )
    if min_price is not None:
        stmt = stmt.where(MenuItem.price >= min_price)
    if max_price is not None:
        stmt = stmt.where(MenuItem.price <= max_price)
    if category:
        stmt = stmt.where(MenuItem.category == category)
    if veg_only:
        stmt = stmt.where(MenuItem.is_veg.is_(True))
    if available_only:
        stmt = stmt.where(MenuItem.is_available.is_(True))
    return stmt


def _menu_sort(stmt, sort: MenuSort):
    return stmt.order_by(
        {
            "name": MenuItem.name.asc(),
            "price_asc": MenuItem.price.asc(),
            "price_desc": MenuItem.price.desc(),
            "newest": MenuItem.created_at.desc(),
        }[sort],
        MenuItem.id.asc(),
    )


@router.get("/restaurants", response_model=Page[RestaurantOut])
def list_restaurants(
    db: DbSession,
    pg: PageParams,
    q: Annotated[str | None, Query(max_length=100, description="Search by name or cuisine")] = None,
    cuisine: Annotated[str | None, Query(max_length=100)] = None,
    open_only: bool = False,
    sort: Literal["rating", "name", "newest"] = "rating",
):
    stmt = select(Restaurant)
    if q:
        stmt = stmt.where(
            or_(Restaurant.name.ilike(_like(q), escape="\\"), Restaurant.cuisine.ilike(_like(q), escape="\\"))
        )
    if cuisine:
        stmt = stmt.where(Restaurant.cuisine.ilike(cuisine))
    if open_only:
        stmt = stmt.where(Restaurant.is_open.is_(True))
    order = {
        "rating": (Restaurant.rating_avg.desc(), Restaurant.rating_count.desc()),
        "name": (Restaurant.name.asc(),),
        "newest": (Restaurant.created_at.desc(),),
    }[sort]
    stmt = stmt.order_by(Restaurant.is_open.desc(), *order, Restaurant.id)
    rows, total, pages = paginate(db, stmt, pg.page, pg.page_size)
    return page_response(rows, total, pg.page, pg.page_size, pages)


@router.get("/restaurants/cuisines", response_model=list[str])
def list_cuisines(db: DbSession):
    return [c for c in db.scalars(select(Restaurant.cuisine).where(Restaurant.cuisine.is_not(None)).distinct().order_by(Restaurant.cuisine))]


@router.get("/restaurants/{restaurant_id}", response_model=RestaurantDetailOut)
def get_restaurant(restaurant_id: int, db: DbSession):
    r = db.get(Restaurant, restaurant_id)
    if r is None:
        raise HTTPException(status_code=404, detail="Restaurant not found")
    categories = list(
        db.scalars(
            select(MenuItem.category)
            .where(MenuItem.restaurant_id == r.id, MenuItem.category.is_not(None))
            .distinct()
            .order_by(MenuItem.category)
        )
    )
    return RestaurantDetailOut.model_validate({**RestaurantOut.model_validate(r).model_dump(), "categories": categories})


@router.get("/restaurants/{restaurant_id}/menu", response_model=Page[MenuItemOut])
def restaurant_menu(
    restaurant_id: int,
    db: DbSession,
    pg: PageParams,
    q: Annotated[str | None, Query(max_length=100, description="Search dish name/description")] = None,
    min_price: Annotated[Decimal | None, Query(ge=0)] = None,
    max_price: Annotated[Decimal | None, Query(ge=0)] = None,
    category: Annotated[str | None, Query(max_length=80)] = None,
    veg_only: bool = False,
    available_only: bool = False,
    sort: MenuSort = "name",
):
    if db.get(Restaurant, restaurant_id) is None:
        raise HTTPException(status_code=404, detail="Restaurant not found")
    if min_price is not None and max_price is not None and min_price > max_price:
        raise HTTPException(status_code=422, detail="min_price cannot be greater than max_price")
    stmt = select(MenuItem).where(MenuItem.restaurant_id == restaurant_id)
    stmt = _menu_filters(stmt, q, min_price, max_price, category, veg_only, available_only)
    stmt = _menu_sort(stmt.order_by(MenuItem.is_available.desc()), sort)
    rows, total, pages = paginate(db, stmt, pg.page, pg.page_size)
    return page_response(rows, total, pg.page, pg.page_size, pages)


@router.get("/dishes", response_model=Page[DishSearchOut])
def search_dishes(
    db: DbSession,
    pg: PageParams,
    q: Annotated[str | None, Query(max_length=100)] = None,
    min_price: Annotated[Decimal | None, Query(ge=0)] = None,
    max_price: Annotated[Decimal | None, Query(ge=0)] = None,
    veg_only: bool = False,
    sort: MenuSort = "name",
):
    """Search dishes across all open restaurants by name and price range."""
    stmt = (
        select(MenuItem)
        .join(Restaurant, Restaurant.id == MenuItem.restaurant_id)
        .where(Restaurant.is_open.is_(True))
        .options(joinedload(MenuItem.restaurant))
    )
    stmt = _menu_sort(_menu_filters(stmt, q, min_price, max_price, None, veg_only, True), sort)
    rows, total, pages = paginate(db, stmt, pg.page, pg.page_size)
    items = [
        DishSearchOut.model_validate({**MenuItemOut.model_validate(m).model_dump(), "restaurant_name": m.restaurant.name})
        for m in rows
    ]
    return page_response(items, total, pg.page, pg.page_size, pages)


@router.get("/restaurants/{restaurant_id}/reviews", response_model=Page[ReviewOut])
def restaurant_reviews(restaurant_id: int, db: DbSession, pg: PageParams):
    if db.get(Restaurant, restaurant_id) is None:
        raise HTTPException(status_code=404, detail="Restaurant not found")
    stmt = (
        select(Review)
        .where(Review.restaurant_id == restaurant_id)
        .options(joinedload(Review.customer))
        .order_by(Review.created_at.desc())
    )
    rows, total, pages = paginate(db, stmt, pg.page, pg.page_size)
    items = [
        ReviewOut(
            id=r.id, order_id=r.order_id, rating=r.rating, comment=r.comment, created_at=r.created_at,
            customer_name=r.customer.name.split()[0],  # first name only — privacy
        )
        for r in rows
    ]
    return page_response(items, total, pg.page, pg.page_size, pages)

