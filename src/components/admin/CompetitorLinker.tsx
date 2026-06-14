"use client";

import { useState } from "react";
import { linkAction, recomputeOddsAction } from "@/app/admin/competitors/actions";

interface CompetitorRow {
  id: string;
  displayName: string;
  eloRating: number;
  userId: string | null;
  linkedUsername: string | null;
}

interface UserOption {
  id: string;
  label: string;
}

export function CompetitorLinker({
  competitors,
  users,
  activeTournamentId,
}: {
  competitors: CompetitorRow[];
  users: UserOption[];
  activeTournamentId: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      {activeTournamentId && (
        <form
          action={async (fd) => {
            setBusy(true);
            setMsg(null);
            const res = await recomputeOddsAction(fd);
            setBusy(false);
            setMsg(res.ok ? "Kurzy přepočítány." : res.error);
          }}
          className="flex items-center gap-3"
        >
          <input type="hidden" name="tournamentId" value={activeTournamentId} />
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-amber-950 hover:brightness-110 disabled:opacity-50"
          >
            {busy ? "Počítám…" : "Přepočítat kurzy"}
          </button>
          {msg && <span className="text-sm text-slate-400">{msg}</span>}
        </form>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-slate-900/60 text-left text-xs uppercase text-slate-400">
            <tr>
              <th className="px-4 py-3">Soutěžící</th>
              <th className="px-4 py-3">Rating</th>
              <th className="px-4 py-3">Účet</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {competitors.map((c) => (
              <tr key={c.id} className="bg-slate-950/40">
                <td className="px-4 py-3 font-medium text-slate-100">
                  {c.displayName}
                </td>
                <td className="px-4 py-3 tabular-nums text-slate-300">
                  {c.eloRating}
                </td>
                <td className="px-4 py-3">
                  {c.userId ? (
                    <span className="text-emerald-400">
                      @{c.linkedUsername}
                    </span>
                  ) : (
                    <form
                      action={async (fd) => {
                        const res = await linkAction(fd);
                        if (!res.ok) setMsg(res.error);
                      }}
                      className="flex items-center gap-2"
                    >
                      <input type="hidden" name="competitorId" value={c.id} />
                      <select
                        name="userId"
                        required
                        defaultValue=""
                        className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-slate-200"
                      >
                        <option value="" disabled>
                          Vyber účet…
                        </option>
                        {users.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.label}
                          </option>
                        ))}
                      </select>
                      <button
                        type="submit"
                        className="rounded-md bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-900 hover:bg-white"
                      >
                        Přiřadit
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
            {competitors.length === 0 && (
              <tr>
                <td
                  colSpan={3}
                  className="px-4 py-6 text-center text-slate-500"
                >
                  Zatím žádní soutěžící. Naimportuj historii skriptem
                  <code className="mx-1">import-history</code>.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
