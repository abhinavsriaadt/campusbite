import { useEffect, useRef } from "react";

/**
 * Six single-digit boxes (DESIGN.md §10). Typing advances, Backspace on an empty box goes back,
 * ←/→/Home/End move, and pasting (or iOS/Android one-time-code autofill) spreads a full code
 * across the boxes. `onComplete(code)` fires once every box holds a digit.
 *
 * value: array of `length` strings ("" or one digit). `invalid` gives danger borders;
 * changing `shakeKey` replays the shake animation.
 */
export default function OtpInput({
  value, onChange, onComplete, length = 6, disabled = false, invalid = false, success = false, shakeKey = 0,
  autoFocus = true, describedBy, label = "Verification code",
}) {
  const refs = useRef([]);
  const groupRef = useRef(null);

  const focusBox = (i) => {
    const el = refs.current[Math.max(0, Math.min(length - 1, i))];
    if (el) {
      el.focus();
      el.select();
    }
  };

  useEffect(() => {
    if (autoFocus && !disabled) focusBox(value.findIndex((d) => !d) === -1 ? 0 : value.findIndex((d) => !d));
    // Only on mount and when the boxes are re-enabled after a submit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled]);

  // Replay the shake on every new error.
  useEffect(() => {
    const el = groupRef.current;
    if (!shakeKey || !el) return;
    el.classList.remove("otp--shake");
    void el.offsetWidth; // restart the CSS animation
    el.classList.add("otp--shake");
  }, [shakeKey]);

  function commit(next, focusIndex) {
    onChange(next);
    const complete = next.every((d) => d !== "");
    if (focusIndex !== undefined && !complete) focusBox(focusIndex);
    if (complete) onComplete?.(next.join(""));
  }

  /** Put `digits` into the boxes starting at `start` (paste / autofill / fast typing). */
  function spread(digits, start) {
    const from = digits.length >= length ? 0 : start;
    const next = [...value];
    digits.slice(0, length - from).split("").forEach((d, k) => { next[from + k] = d; });
    commit(next, Math.min(length - 1, from + digits.length));
  }

  function handleChange(i, e) {
    const digits = e.target.value.replace(/\D/g, "");
    if (!digits) {
      const next = [...value];
      next[i] = "";
      commit(next);
      return;
    }
    if (digits.length > 1) {
      // The box already held a digit, or the OS autofilled the whole code into this box.
      const fresh = value[i] && digits.length === 2 ? digits.replace(value[i], "") || digits[1] : digits;
      if (fresh.length === 1) {
        const next = [...value];
        next[i] = fresh;
        commit(next, i + 1);
      } else {
        spread(fresh, i);
      }
      return;
    }
    const next = [...value];
    next[i] = digits;
    commit(next, i + 1);
  }

  function handleKeyDown(i, e) {
    if (e.key === "Backspace" && !value[i] && i > 0) {
      e.preventDefault();
      const next = [...value];
      next[i - 1] = "";
      commit(next, i - 1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      focusBox(i - 1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      focusBox(i + 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      focusBox(0);
    } else if (e.key === "End") {
      e.preventDefault();
      focusBox(length - 1);
    }
  }

  function handlePaste(i, e) {
    const digits = (e.clipboardData?.getData("text") || "").replace(/\D/g, "");
    e.preventDefault();
    if (digits) spread(digits, i);
  }

  return (
    <div
      ref={groupRef}
      className={`otp${invalid ? " otp--invalid" : ""}${success ? " otp--success" : ""}`}
      role="group"
      aria-label={label}
      aria-describedby={describedBy}
      onAnimationEnd={(e) => e.currentTarget.classList.remove("otp--shake")}
    >
      {value.map((d, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          className={`otp__box${d ? " otp__box--filled" : ""}`}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          aria-label={`Digit ${i + 1} of ${length}`}
          aria-invalid={invalid || undefined}
          value={d}
          disabled={disabled}
          onChange={(e) => handleChange(i, e)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={(e) => handlePaste(i, e)}
          onFocus={(e) => e.target.select()}
        />
      ))}
    </div>
  );
}
