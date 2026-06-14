"use client";

import { useState } from "react";
import {
  addFromCompetitorAction,
  addNewcomerAction,
} from "@/app/admin/tournaments/[id]/players/actions";

interface CompetitorOption {
  id: string;
  name: string;
  elo: number;
}

export function RosterFromCompetitor({
  tournamentId,
  competitors,
}: {
  tournamentId: string;
  competitors: CompetitorOption[];
}) {
  const [msg, setMsg] = useState<string | null>(null);

  const inputCls =
    "rounded-md border bg-background px-2 py-1.5 text-sm";
  const btnCls =
    "rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:opacity-90";

  return (
    <div className="space-y-3">
      <form
        action={async (fd) => {
          const cid = String(fd.get("competitorId") ?? "");
          if (!cid) return;
          const r = await addFromCompetitorAction(tournamentId, cid);
          setMsg(r.ok ? "Přidáno z databáze." : r.error);
        }}
        className="flex flex-wrap items-center gap-2"
      >
        <select
          name="competitorId"
          defaultValue=""
          required
          className={inputCls}
          disabled={competitors.length === 0}
        >
          <option value="" disabled>
            {competitors.length === 0
              ? "Žádní volní hráči v databázi"
              : "Vyber hráče z databáze…"}
          </option>
          {competitors.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.elo})
            </option>
          ))}
        </select>
        <button type="submit" className={btnCls}>
          Přidat z databáze
        </button>
      </form>

      <form
        action={async (fd) => {
          const name = String(fd.get("name") ?? "");
          const r = await addNewcomerAction(tournamentId, name);
          setMsg(r.ok ? "Nováček přidán (1500)." : r.error);
        }}
        className="flex flex-wrap items-center gap-2"
      >
        <input
          name="name"
          placeholder="Jméno nováčka"
          className={inputCls}
          required
        />
        <button type="submit" className={btnCls}>
          Přidat nováčka (1500)
        </button>
      </form>

      {msg && <p className="text-xs text-muted-foreground">{msg}</p>}
    </div>
  );
}
