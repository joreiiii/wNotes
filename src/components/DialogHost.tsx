import { useEffect, useRef, useState } from "react";
import { useDialogStore } from "../state/dialogStore";

/**
 * Renders the app's own dialogs. Native window.prompt/confirm are avoided
 * entirely — a webview renders them with the page URL in the title, which
 * immediately gives away that the app is web-based.
 */
export default function DialogHost() {
  const current = useDialogStore((s) => s.current);
  const closing = useDialogStore((s) => s.closing);
  const submit = useDialogStore((s) => s.submit);
  const finishClose = useDialogStore((s) => s.finishClose);

  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (current?.kind === "prompt") {
      setValue(current.defaultValue);
      // Wait for the entry animation to start so focus does not fight it.
      const t = window.setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 80);
      return () => window.clearTimeout(t);
    }
  }, [current?.id, current?.kind]);

  useEffect(() => {
    if (!current) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        submit(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, submit]);

  if (!current) return null;

  const cancel = () => submit(null);

  return (
    <div
      className={"dialog-overlay" + (closing ? " closing" : "")}
      onClick={cancel}
      onAnimationEnd={(e) => {
        // Only the overlay's own fade-out ends the lifecycle.
        if (closing && e.target === e.currentTarget) finishClose();
      }}
    >
      <div className={"dialog-panel" + (closing ? " closing" : "")} onClick={(e) => e.stopPropagation()}>
        <h2 className="dialog-title">{current.title}</h2>

        {current.kind === "prompt" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const trimmed = value.trim();
              submit(trimmed.length > 0 ? trimmed : null);
            }}
          >
            {current.label && <div className="dialog-label">{current.label}</div>}
            <input
              ref={inputRef}
              className="dialog-input"
              value={value}
              placeholder={current.placeholder}
              onChange={(e) => setValue(e.target.value)}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="sentences"
              spellCheck={false}
            />
            <div className="dialog-buttons">
              <button type="button" className="dialog-btn" onClick={cancel}>
                Abbrechen
              </button>
              <button type="submit" className="dialog-btn primary" disabled={value.trim().length === 0}>
                {current.confirmLabel}
              </button>
            </div>
          </form>
        )}

        {current.kind === "confirm" && (
          <>
            {current.message && <p className="dialog-message">{current.message}</p>}
            <div className="dialog-buttons">
              <button className="dialog-btn" onClick={cancel}>
                Abbrechen
              </button>
              <button
                className={"dialog-btn " + (current.destructive ? "destructive" : "primary")}
                onClick={() => submit(true)}
              >
                {current.confirmLabel}
              </button>
            </div>
          </>
        )}

        {current.kind === "actions" && (
          <div className="dialog-actions">
            {current.actions.map((a, i) => (
              <button
                key={a.id}
                className={"dialog-action" + (a.destructive ? " destructive" : "")}
                style={{ animationDelay: `${i * 28}ms` }}
                onClick={() => submit(a.id)}
              >
                {a.label}
              </button>
            ))}
            <button className="dialog-action muted" style={{ animationDelay: `${current.actions.length * 28}ms` }} onClick={cancel}>
              Abbrechen
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
