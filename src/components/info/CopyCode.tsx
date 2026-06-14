"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function CopyCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(code);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // clipboard not available (e.g. insecure context) — ignore
        }
      }}
      className="inline-flex items-center gap-2 rounded-lg border bg-background px-3 py-1.5 font-mono text-lg font-semibold transition hover:bg-muted"
      aria-label="Zkopírovat zvací kód"
    >
      {code}
      {copied ? (
        <Check className="h-4 w-4 text-emerald-500" />
      ) : (
        <Copy className="h-4 w-4 text-muted-foreground" />
      )}
      <span className="sr-only">{copied ? "Zkopírováno" : "Kopírovat"}</span>
    </button>
  );
}
