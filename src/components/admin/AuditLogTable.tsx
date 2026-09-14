"use client";

import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserLink } from "@/components/user/UserLink";

export type AuditRow = {
  id: string;
  createdAt: Date;
  /** Handle, for the profile link. */
  username: string;
  /** Name to read, which is usually not the handle. */
  displayName: string;
  type: string;
  amount: string;
  balanceAfter: string;
  note: string | null;
  createdByUsername: string | null;
  createdByDisplayName: string | null;
};

/** Czech labels for the raw transaction_type enum. */
const TYPE_LABEL: Record<string, string> = {
  initial: "Počáteční vklad",
  bet_placed: "Sázka",
  bet_won: "Výhra",
  bet_refund: "Vrácení sázky",
  admin_adjust: "Úprava adminem",
  tournament_reset: "Reset turnaje",
};

export function AuditLogTable({ rows }: { rows: AuditRow[] }) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState<string | null>(null);

  const fmt = new Intl.NumberFormat("cs-CZ", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const dt = new Intl.DateTimeFormat("cs-CZ", { dateStyle: "short", timeStyle: "short" });

  // Only offer filters for types that actually occur in this window.
  const types = [...new Set(rows.map((r) => r.type))].sort();

  const q = query.trim().toLowerCase();
  const filtered = rows.filter(
    (r) =>
      (!type || r.type === type) &&
      (!q ||
        r.displayName.toLowerCase().includes(q) ||
        r.username.toLowerCase().includes(q) ||
        (r.note ?? "").toLowerCase().includes(q) ||
        (r.createdByDisplayName ?? "").toLowerCase().includes(q))
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Hledat hráče nebo poznámku…"
          aria-label="Hledat v transakcích"
          className="h-8 w-full sm:w-64"
        />
        <div className="flex flex-wrap items-center gap-1">
          <Button
            size="sm"
            variant={type === null ? "secondary" : "ghost"}
            onClick={() => setType(null)}
          >
            Vše
          </Button>
          {types.map((t) => (
            <Button
              key={t}
              size="sm"
              variant={type === t ? "secondary" : "ghost"}
              onClick={() => setType(type === t ? null : t)}
            >
              {TYPE_LABEL[t] ?? t}
            </Button>
          ))}
        </div>
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          {filtered.length === rows.length
            ? `${rows.length} transakcí`
            : `${filtered.length} z ${rows.length}`}
        </span>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Čas</TableHead>
            <TableHead>Uživatel</TableHead>
            <TableHead>Typ</TableHead>
            <TableHead className="text-right">Částka</TableHead>
            <TableHead className="text-right">Zůstatek po</TableHead>
            <TableHead>Poznámka</TableHead>
            <TableHead>Provedl admin</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((r) => {
            const amount = Number(r.amount);
            return (
              <TableRow key={r.id}>
                <TableCell className="whitespace-nowrap">{dt.format(r.createdAt)}</TableCell>
                <TableCell>
                  <UserLink username={r.username}>{r.displayName}</UserLink>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{TYPE_LABEL[r.type] ?? r.type}</Badge>
                </TableCell>
                <TableCell
                  className={
                    amount > 0
                      ? "text-right font-mono text-emerald-600 dark:text-emerald-400"
                      : "text-right font-mono"
                  }
                >
                  {amount > 0 ? `+${fmt.format(amount)}` : fmt.format(amount)}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {fmt.format(Number(r.balanceAfter))}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{r.note ?? "—"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {r.createdByUsername ? (
                    <UserLink username={r.createdByUsername}>
                      {r.createdByDisplayName ?? r.createdByUsername}
                    </UserLink>
                  ) : (
                    "—"
                  )}
                </TableCell>
              </TableRow>
            );
          })}
          {filtered.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                {rows.length === 0
                  ? "Žádné transakce"
                  : "Žádná transakce neodpovídá filtru."}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
