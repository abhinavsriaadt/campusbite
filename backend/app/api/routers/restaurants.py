"""Public catalogue: categories, restaurants, menus, dish search and reviews (no login needed)."""

from decimal import Decimal
from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import joinedload, selectinload

from app.api.deps import DbSession, PageParams
from app.models import Category, MenuItem, Restaurant, Review, restaurant_categories
from app.schemas import (
    CategoryOut,
    DishSearchOut,
    MenuItemOut,
    MenuOut,
    MenuSection,
    Page,
    RestaurantDetailOut,
    RestaurantOut,
    ReviewOut,
)
from app.services.pagination import page_response, paginate

router = APIRouter(tags=["Restaurants & Menus"])


def _get_restaurant(db, restaurant_id: int) -> Restaurant:
    r = db.get(Restaurant, restaurant_id)
    if r is None:
        raise HTTPException(status_code=404, detail="Restaurant not found")
    return r


def _like(term: str) -> str:
    escaped = term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


MenuSort = Literal["menu", "name", "price_asc", "price_desc", "newest"]


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
    key = {
        "menu": MenuItem.id.asc(),
        "name": MenuItem.name.asc(),
        "price_asc": MenuItem.price.asc(),
        "price_desc": MenuItem.price.desc(),
        "newest": MenuItem.created_at.desc(),
    }[sort]
    return stmt.order_by(key, MenuItem.id.asc())


_WITH_CATEGORIES = (selectinload(Restaurant.categories), joinedload(Restaurant.primary_category))


@router.get("/categories", response_model=list[CategoryOut], tags=["Categories"])
def list_categories(db: DbSession):
    """Browse categories with how many restaurants are in each."""
    count = (
        select(func.count(restaurant_categories.c.restaurant_id))
        .select_from(restaurant_categories.join(Restaurant, Restaurant.id == restaurant_categories.c.restaurant_id))
        .where(restaurant_categories.c.category_id == Category.id)
        .scalar_subquery()
    )
    rows = db.execute(select(Category, count).order_by(Category.id)).all()
    return [
        CategoryOut(slug=c.slug, name=c.name, description=c.description, restaurant_count=n or 0) for c, n in rows
    ]


@router.get("/restaurants", response_model=Page[RestaurantOut])
def list_restaurants(
    db: DbSession,
    pg: PageParams,
    q: Annotated[str | None, Query(max_length=100, description="Search by name or cuisine")] = None,
    search: Annotated[str | None, Query(max_length=100, description="Alias of q")] = None,
    category: Annotated[str | None, Query(max_length=50, description="Category slug, e.g. coffee")] = None,
    cuisine: Annotated[str | None, Query(max_length=100)] = None,
    open_only: bool = False,
    sort: Literal["rating", "name", "newest"] = "rating",
    size: Annotated[int | None, Query(ge=1, le=100, description="Alias of page_size")] = None,
):
    page_size = size or pg.page_size
    term = q or search
    stmt = select(Restaurant).options(*_WITH_CATEGORIES)
    if term:
        stmt = stmt.where(
            or_(Restaurant.name.ilike(_like(term), escape="\\"), Restaurant.cuisine.ilike(_like(term), escape="\\"))
        )
    if category:
        # EXISTS through restaurant_categories, so multi-category restaurants match every one.
        stmt = stmt.where(Restaurant.categories.any(Category.slug == category))
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
    rows, total, pages = paginate(db, stmt, pg.page, page_size)
    return page_response(rows, total, pg.page, page_size, pages)


@router.get("/restaurants/cuisines", response_model=list[str])
def list_cuisines(db: DbSession):
    return [c for c in db.scalars(select(Restaurant.cuisine).where(Restaurant.cuisine.is_not(None)).distinct().order_by(Restaurant.cuisine))]


def _sections(db, restaurant_id: int) -> list[str]:
    """Menu section names in menu order (order of each section's first dish)."""
    first = func.min(MenuItem.id)
    rows = db.execute(
        select(MenuItem.category, first)
        .where(MenuItem.restaurant_id == restaurant_id, MenuItem.category.is_not(None))
        .group_by(MenuItem.category)
        .order_by(first)
    ).all()
    return [c for c, _ in rows]


@router.get("/restaurants/{restaurant_id}", response_model=RestaurantDetailOut)
def get_restaurant(restaurant_id: int, db: DbSession):
    r = _get_restaurant(db, restaurant_id)
    return RestaurantDetailOut.model_validate({**RestaurantOut.model_validate(r).model_dump(), "sections": _sections(db, r.id)})


@router.get("/restaurants/{restaurant_id}/menu", response_model=MenuOut)
def restaurant_menu(
    restaurant_id: int,
    db: DbSession,
    q: Annotated[str | None, Query(max_length=100, description="Search dish name/description")] = None,
    search: Annotated[str | None, Query(max_length=100, description="Alias of q")] = None,
    tag: Annotated[str | None, Query(max_length=50, description="Only dishes tagged with this category slug")] = None,
    min_price: Annotated[Decimal | None, Query(ge=0)] = None,
    max_price: Annotated[Decimal | None, Query(ge=0)] = None,
    category: Annotated[str | None, Query(max_length=80, description="Menu section")] = None,
    veg_only: bool = False,
    available_only: bool = False,
    sort: MenuSort = "menu",
):
    """The menu grouped by section. Sections keep menu order; dishes inside follow `sort`."""
    _get_restaurant(db, restaurant_id)
    if min_price is not None and max_price is not None and min_price > max_price:
        raise HTTPException(status_code=422, detail="min_price cannot be greater than max_price")
    lo, hi = db.execute(
        select(func.min(MenuItem.price), func.max(MenuItem.price)).where(MenuItem.restaurant_id == restaurant_id)
    ).one()
    stmt = select(MenuItem).where(MenuItem.restaurant_id == restaurant_id)
    stmt = _menu_sort(_menu_filters(stmt, q or search, min_price, max_price, category, veg_only, available_only), sort)
    items = list(db.scalars(stmt))
    if tag:  # menus are small (tens of dishes), so filtering the JSON list here keeps SQL portable
        items = [m for m in items if tag in (m.tags or [])]

    order = {name: i for i, name in enumerate(_sections(db, restaurant_id))}
    grouped: dict[str | None, list[MenuItem]] = {}
    for m in items:
        grouped.setdefault(m.category, []).append(m)
    names = sorted(grouped, key=lambda c: (c is None, order.get(c, len(order))))
    sections = [MenuSection(name=c or "Other", items=grouped[c]) for c in names]
    return MenuOut(restaurant_id=restaurant_id, total=len(items), price_min=lo, price_max=hi, sections=sections)


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
    _get_restaurant(db, restaurant_id)
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

