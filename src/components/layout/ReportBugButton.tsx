"use client";

import { useState } from "react";
import { Bug } from "lucide-react";
import { reportBugAction } from "@/app/actions/report-bug";

export function ReportBugButton() {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(
    null
  );

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setStatus(null);
          setOpen(true);
        }}
        className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
      >
        <Bug className="h-4 w-4 shrink-0" />
        Nahlásit chybu
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-xl border bg-card p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold">Nahlásit chybu</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Popiš, co nefunguje. Přijde nám to i s informací, na jaké stránce
              jsi byl.
            </p>
            <textarea
              value={msg}
              onChange={(e) => setMsg(e.target.value)}
              rows={4}
              placeholder="Co se stalo?"
              className="mt-3 w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
            {status && (
              <p
                className={`mt-2 text-sm ${
                  status.ok ? "text-emerald-500" : "text-red-500"
                }`}
              >
                {status.text}
              </p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
              >
                Zavřít
              </button>
              <button
                type="button"
                disabled={busy || !msg.trim()}
                onClick={async () => {
                  setBusy(true);
                  setStatus(null);
                  const r = await reportBugAction(
                    msg,
                    window.location.pathname
                  );
                  setBusy(false);
                  if (r.ok) {
                    setStatus({ ok: true, text: "Díky! Odesláno." });
                    setMsg("");
                  } else {
                    setStatus({ ok: false, text: r.error });
                  }
                }}
                className="rounded-md bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {busy ? "Odesílám…" : "Odeslat"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
