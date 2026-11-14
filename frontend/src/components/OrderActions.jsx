import { useEffect, useState } from "react";
import { errorMessage } from "../api/client";
import { ordersApi, ownerApi, returnsApi } from "../api/endpoints";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { money } from "../utils/format";
import { ACTION_META, STATUS_META } from "../utils/status";
import { Alert, Button, ConfirmDialog, Field, Modal, Spinner, StarInput } from "./ui";

/**
 * Renders the actions the API says this user may take on this order (`allowed_actions`).
 * The backend re-validates every transition; this component never decides permissions itself.
 *
 * Status changes are optimistic: `onUpdated` first receives the order with its new status, then the
 * server's version — or the original order again (rollback) with an error toast if the API rejects it.
 * The first lifecycle/assign action is the single primary button.
 */
export default function OrderActions({ order, onUpdated, size = "sm", block = false, exclude = [] }) {
  const { user } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(null);
  const [modal, setModal] = useState(null);

  const actions = (order.allowed_actions || []).filter((a) => !exclude.includes(a));
  const isOwner = user?.role === "restaurant_owner";
  if (!actions.length) return null;

  async function run(key, fn, successMsg, optimisticStatus) {
    setBusy(key);
    if (optimisticStatus) onUpdated?.({ ...order, status: optimisticStatus, allowed_actions: [], status_updated_at: new Date().toISOString() });
    try {
      const updated = await fn();
      toast.success(successMsg);
      setModal(null);
      onUpdated?.(updated);
      return true;
    } catch (err) {
      if (optimisticStatus) onUpdated?.(order); // roll back
      toast.error(errorMessage(err));
      return false;
    } finally {
      setBusy(null);
    }
  }

  const setStatus = (a) =>
    run(a, () => ordersApi.setStatus(order.id, a), `Order #${order.id}: ${STATUS_META[a].label.toLowerCase()}`, a);

  const statusActions = actions.filter((a) => ACTION_META[a]);
  const canAssign = actions.includes("assign") || actions.includes("reassign");
  const primaryKey = statusActions[0] || (canAssign ? "assign" : null);
  const common = { size, block, disabled: !!busy };

  return (
    <>
      {statusActions.map((a) => (
        <Button key={a} {...common} variant={a === primaryKey ? "primary" : "secondary"} loading={busy === a}
          onClick={() => (ACTION_META[a].confirm ? setModal(a) : setStatus(a))}>
          {ACTION_META[a].label}
        </Button>
      ))}
      {canAssign && (
        <Button {...common} variant={primaryKey === "assign" ? "primary" : "secondary"} icon="bike" onClick={() => setModal("assign")}>
          {actions.includes("reassign") ? "Reassign rider" : "Assign rider"}
        </Button>
      )}
      {actions.includes("review") && <Button {...common} variant="secondary" icon="star" onClick={() => setModal("review")}>Rate</Button>}
      {actions.includes("request_return") && <Button {...common} variant="ghost" onClick={() => setModal("return")}>Request refund</Button>}
      {actions.includes("resolve_return") && order.return_request && (
        <>
          <Button {...common} variant="success" onClick={() => setModal("approve")}>Approve refund</Button>
          <Button {...common} variant="danger-outline" onClick={() => setModal("reject")}>Reject refund</Button>
        </>
      )}
      {actions.includes("cancel") && (
        <Button {...common} variant="danger-outline" onClick={() => setModal("cancel")}>{isOwner ? "Reject" : "Cancel order"}</Button>
      )}

      {modal === "DELIVERED" && (
        <ConfirmDialog open title={`Mark order #${order.id} as delivered?`} confirmLabel="Yes, delivered" variant="primary"
          busy={busy === "DELIVERED"} onClose={() => setModal(null)} onConfirm={() => setStatus("DELIVERED")}>
          <p>Only confirm once the food is in the customer&apos;s hands. This can&apos;t be undone.</p>
        </ConfirmDialog>
      )}
      {modal === "cancel" && (
        <CancelDialog order={order} isOwner={isOwner} busy={busy === "cancel"} onClose={() => setModal(null)}
          onConfirm={(reason) => run("cancel", () => ordersApi.cancel(order.id, reason), isOwner ? "Order rejected · payment refunded" : "Order cancelled · refund issued", "CANCELLED")} />
      )}
      {modal === "assign" && (
        <AssignSheet order={order} busy={busy === "assign"} onClose={() => setModal(null)}
          onConfirm={(p) => run("assign", () => ordersApi.assign(order.id, p.id), `Assigned to ${p.name}`)} />
      )}
      {modal === "review" && (
        <ReviewDialog order={order} busy={busy === "review"} onClose={() => setModal(null)}
          onConfirm={(body) => run("review", () => ordersApi.review(order.id, body), "Thanks for your review!")} />
      )}
      {modal === "return" && (
        <ReturnDialog order={order} busy={busy === "return"} onClose={() => setModal(null)}
          onConfirm={(reason) => run("return", () => ordersApi.requestReturn(order.id, reason), "Refund request sent to the restaurant")} />
      )}
      {(modal === "approve" || modal === "reject") && (
        <ResolveReturnDialog approve={modal === "approve"} busy={busy === "resolve"} onClose={() => setModal(null)}
          request={{ ...order.return_request, order_id: order.id, order_total: order.total_amount }}
          onConfirm={(note) => run("resolve", async () => {
            await (modal === "approve" ? returnsApi.approve : returnsApi.reject)(order.return_request.id, note);
            return ordersApi.get(order.id);
          }, modal === "approve" ? "Refund approved" : "Refund request rejected")} />
      )}
    </>
  );
}

function CancelDialog({ order, isOwner, busy, onClose, onConfirm }) {
  const [reason, setReason] = useState("");
  return (
    <ConfirmDialog open title={isOwner ? `Reject order #${order.id}?` : `Cancel order #${order.id}?`}
      confirmLabel={isOwner ? "Reject order" : "Cancel order"} cancelLabel="Keep order" variant="danger" busy={busy}
      onClose={onClose} onConfirm={() => onConfirm(reason.trim())}>
      <p className="muted">The {money(order.total_amount)} payment is refunded automatically. This can&apos;t be undone.</p>
      <Field label="Reason (optional)">
        <textarea className="textarea" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)}
          placeholder={isOwner ? "e.g. Kitchen closing early" : "e.g. Ordered by mistake"} />
      </Field>
    </ConfirmDialog>
  );
}

function AssignSheet({ order, busy, onClose, onConfirm }) {
  const [partners, setPartners] = useState(null);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  useEffect(() => {
    let alive = true;
    ownerApi.partners().then((p) => alive && setPartners(p)).catch((e) => alive && setError(errorMessage(e)));
    return () => { alive = false; };
  }, []);
  const currentId = order.delivery_partner?.id;
  return (
    <Modal open title={`Assign a rider · order #${order.id}`} onClose={onClose}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" loading={busy} disabled={!selected} onClick={() => onConfirm(selected)}>Assign</Button>
      </>}>
      <Alert>{error}</Alert>
      {!partners && !error && <div className="row muted text-sm"><Spinner small /> Loading riders…</div>}
      {partners?.length === 0 && <p className="muted">No delivery partners have registered yet.</p>}
      <div className="stack-sm" role="radiogroup" aria-label="Delivery partners">
        {partners?.map((p) => {
          const isCurrent = p.id === currentId;
          return (
            <label key={p.id} className={`pick${selected?.id === p.id ? " pick--on" : ""}${isCurrent ? " pick--disabled" : ""}`}>
              <input type="radio" name="partner" disabled={isCurrent} checked={selected?.id === p.id} onChange={() => setSelected(p)} />
              <span className="grow">
                <span className="strong">{p.name}</span>{isCurrent && <span className="text-xs muted"> (current)</span>}
                <span className="text-xs muted block">{p.phone || "No phone"} · {p.completed_deliveries} delivered</span>
              </span>
              <span className={`badge badge--${p.active_deliveries ? "warning" : "success"}`}>{p.active_deliveries ? `${p.active_deliveries} active` : "Free"}</span>
            </label>
          );
        })}
      </div>
    </Modal>
  );
}

function ReviewDialog({ order, busy, onClose, onConfirm }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  return (
    <Modal open title={`Rate ${order.restaurant.name}`} onClose={onClose}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Later</Button>
        <Button variant="primary" loading={busy} disabled={!rating} onClick={() => onConfirm({ rating, comment: comment.trim() || null })}>Submit review</Button>
      </>}>
      <p className="muted text-sm center">How was order #{order.id}?</p>
      <StarInput value={rating} onChange={setRating} />
      <Field label="Tell others about it (optional)">
        <textarea className="textarea" maxLength={1000} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Taste, portion, packaging…" />
      </Field>
    </Modal>
  );
}

function ReturnDialog({ order, busy, onClose, onConfirm }) {
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const len = reason.trim().length;
  const error = touched && len < 10 ? "Please describe the problem in at least 10 characters." : null;
  return (
    <Modal open title={`Request a refund · order #${order.id}`} onClose={onClose}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" loading={busy} onClick={() => (len < 10 ? setTouched(true) : onConfirm(reason.trim()))}>Send request</Button>
      </>}>
      <p className="muted text-sm">The restaurant reviews your request. If approved, {money(order.total_amount)} is refunded. You can send only one request per order.</p>
      <Field label="What went wrong?" error={error} hint={`${len}/10 characters minimum`}>
        <textarea className="textarea" maxLength={1000} value={reason} onBlur={() => setTouched(true)} onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. One item was missing and the food arrived cold." />
      </Field>
    </Modal>
  );
}

/** Approve or reject a refund request — always a confirm step (DESIGN.md §6). */
export function ResolveReturnDialog({ request, approve, busy, onClose, onConfirm }) {
  const [note, setNote] = useState("");
  return (
    <ConfirmDialog open busy={busy} onClose={onClose} onConfirm={() => onConfirm(note.trim())}
      title={approve ? `Approve refund of ${money(request.order_total)}?` : "Reject this refund request?"}
      confirmLabel={approve ? "Approve refund" : "Reject request"} variant={approve ? "success" : "danger"}>
      <div className="quote">
        <span className="eyebrow">Customer&apos;s reason · order #{request.order_id}</span>
        <p>{request.reason}</p>
      </div>
      <p className="text-sm muted">
        {approve ? "The order is marked Refunded, the payment becomes Refunded and a refund entry is written to the ledger. This can't be undone."
          : "The customer will see that the request was rejected. They can't send another request for this order."}
      </p>
      <Field label="Note to the customer (optional)">
        <textarea className="textarea" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
    </ConfirmDialog>
  );
}
