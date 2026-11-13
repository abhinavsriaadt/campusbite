import { useState } from "react";
import { Link } from "react-router-dom";
import { errorMessage } from "../../api/client";
import { returnsApi } from "../../api/endpoints";
import { ResolveReturnDialog } from "../../components/OrderActions";
import {
  Button, EmptyState, ErrorState, ListSkeleton, Pagination, ReturnBadge, StatusBadge, Tabs,
} from "../../components/ui";
import { useToast } from "../../context/ToastContext";
import { usePaged } from "../../hooks/usePaged";
import { dateTime, money } from "../../utils/format";

export default function OwnerReturns() {
  const toast = useToast();
  const [status, setStatus] = useState("pending");
  const list = usePaged((page) => returnsApi.list({ status, page, page_size: 10 }), [status]);
  const [active, setActive] = useState(null); // { request, approve }
  const [busy, setBusy] = useState(false);

  async function decide(note) {
    const { request, approve } = active;
    setBusy(true);
    try {
      const updated = await (approve ? returnsApi.approve : returnsApi.reject)(request.id, note);
      toast.success(approve ? `Refund of ${money(request.order_total)} approved` : "Refund request rejected");
      setActive(null);
      if (status === "pending") list.setItems((items) => items.filter((r) => r.id !== request.id));
      else list.setItems((items) => items.map((r) => (r.id === updated.id ? updated : r)));
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="page-head"><div><h1>Returns &amp; refunds</h1><p>Review refund requests customers made after delivery.</p></div></div>
      <Tabs label="Request status" value={status} onChange={setStatus}
        items={[{ value: "pending", label: "Pending" }, { value: "approved", label: "Approved" }, { value: "rejected", label: "Rejected" }, { value: "", label: "All" }]} />
      <div className="section-sm">
        {list.error ? <ErrorState message={list.error} onRetry={list.reload} />
          : !list.loaded ? <ListSkeleton count={3} />
          : !list.items.length ? (
            <EmptyState icon="rotate" title={status === "pending" ? "No pending requests" : "Nothing here yet"}>
              Refund requests from customers appear here.
            </EmptyState>
          ) : (
            <div className={`stack${list.loading ? " is-refreshing" : ""}`}>
              {list.items.map((r) => (
                <article key={r.id} className="card card--pad stack-sm">
                  <div className="row-between">
                    <span className="row">
                      <Link to={`/orders/${r.order_id}`} className="strong">Order #{r.order_id}</Link>
                      <span className="muted">· {r.customer_name}</span>
                    </span>
                    <span className="price strong">{money(r.order_total)}</span>
                  </div>
                  <div className="row">
                    <ReturnBadge status={r.status} />
                    <StatusBadge status={r.order_status} />
                    <span className="text-xs muted">Requested {dateTime(r.created_at)}</span>
                  </div>
                  <blockquote className="quote">“{r.reason}”</blockquote>
                  {r.resolution_note && <p className="text-sm"><b>Your note:</b> {r.resolution_note}</p>}
                  {r.status === "pending" && (
                    <div className="row return__actions">
                      <Button variant="success" icon="check" onClick={() => setActive({ request: r, approve: true })}>Approve</Button>
                      <Button variant="danger-outline" icon="x" onClick={() => setActive({ request: r, approve: false })}>Reject</Button>
                    </div>
                  )}
                </article>
              ))}
              <Pagination list={list} />
            </div>
          )}
      </div>
      {active && <ResolveReturnDialog request={active.request} approve={active.approve} busy={busy} onClose={() => setActive(null)} onConfirm={decide} />}
    </>
  );
}
