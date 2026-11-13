/** Shimmer placeholders shaped like the content they replace (DESIGN.md §3). */
export function Skeleton({ className = "", width }) {
  return <span className={`skel ${className}`} style={width ? { width } : undefined} aria-hidden />;
}

export function RestaurantCardSkeleton() {
  return (
    <div className="card rcard" aria-hidden>
      <Skeleton className="skel-img" />
      <div className="rcard__body">
        <Skeleton className="skel-line skel-line--lg" width="60%" />
        <Skeleton className="skel-line" width="40%" />
        <Skeleton className="skel-line" width="70%" />
      </div>
    </div>
  );
}

export function DishSkeleton() {
  return (
    <div className="dish" aria-hidden>
      <div className="dish__text">
        <Skeleton className="skel-line" width="30%" />
        <Skeleton className="skel-line skel-line--lg" width="55%" />
        <Skeleton className="skel-line" width="20%" />
        <Skeleton className="skel-line" width="85%" />
      </div>
      <Skeleton className="skel-thumb" />
    </div>
  );
}

/** Generic row/card skeleton for order lists, tables and boards. */
export function RowSkeleton() {
  return (
    <div className="card card--pad stack-sm" aria-hidden>
      <Skeleton className="skel-line skel-line--lg" width="35%" />
      <Skeleton className="skel-line" width="70%" />
      <Skeleton className="skel-line" width="50%" />
    </div>
  );
}

export function ListSkeleton({ count = 3, Item = RowSkeleton }) {
  return (
    <div className="stack" role="status" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => <Item key={i} />)}
    </div>
  );
}
