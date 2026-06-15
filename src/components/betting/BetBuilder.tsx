"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trash2, X } from "lucide-react";
import { placeParlayAction } from "@/app/(app)/bet-builder/actions";
import { formatJablka } from "@/lib/jablka";

export type BuilderSelectionVM = {
  id: string;
  label: string;
  finalOdds: number;
};
export type BuilderMarketVM = {
  id: string;
  title: string;
  selections: BuilderSelectionVM[];
};
export type BuilderGroupVM = {
  key: string;
  label: string;
  sublabel: string | null;
  markets: BuilderMarketVM[];
};

type SlipEntry = {
  selectionId: string;
  marketId: string;
  groupKey: string;
  groupLabel: string;
  marketTitle: string;
  selectionLabel: string;
  odds: number;
};

const fmt = new Intl.NumberFormat("cs-CZ", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function BetBuilder({
  groups,
  capital,
  maxBet,
}: {
  groups: BuilderGroupVM[];
  capital: number;
  /** App-wide max stake per ticket, or null when no limit is set. */
  maxBet: number | null;
}) {
  const router = useRouter();
  const [slip, setSlip] = useState<SlipEntry[]>([]);
  const [stake, setStake] = useState<string>("");
  const [pending, start] = useTransition();

  const selectedIds = useMemo(
    () => new Set(slip.map((s) => s.selectionId)),
    [slip]
  );

  // Map "selected market" so we can block a second pick from the same market.
  const blockedMarketIds = useMemo(
    () => new Set(slip.map((s) => s.marketId)),
    [slip]
  );

  function toggle(
    entry: Omit<SlipEntry, "selectionId" | "groupKey"> & {
      selectionId: string;
      groupKey: string;
    }
  ) {
    setSlip((prev) => {
      if (prev.some((s) => s.selectionId === entry.selectionId)) {
        return prev.filter((s) => s.selectionId !== entry.selectionId);
      }
      // If another selection in the same market is selected, replace it.
      const filtered = prev.filter((s) => s.marketId !== entry.marketId);
      return [...filtered, entry];
    });
  }

  function clearSlip() {
    setSlip([]);
  }

  const combinedOdds = slip.reduce((acc, s) => acc * s.odds, 1);
  const stakeNum = Number(stake) || 0;
  const maxStake = maxBet != null ? Math.min(capital, maxBet) : capital;
  const potential = stakeNum > 0 ? stakeNum * combinedOdds : 0;

  const canSubmit =
    slip.length >= 2 &&
    stakeNum > 0 &&
    stakeNum <= maxStake &&
    !pending;

  function submit() {
    if (!canSubmit) return;
    start(async () => {
      const r = await placeParlayAction(
        slip.map((s) => s.selectionId),
        stakeNum
      );
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Akumulátor podán!");
      setSlip([]);
      setStake("");
      router.push("/bets");
      router.refresh();
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <div className="space-y-4 lg:order-1">
        {groups.map((g) => (
          <Card key={g.key}>
            <CardHeader className="space-y-1">
              <CardTitle className="text-base">{g.label}</CardTitle>
              {g.sublabel && (
                <p className="text-xs uppercase tracking-wider text-muted-foreground">
                  {g.sublabel}
                </p>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              {g.markets.map((m) => (
                <div key={m.id} className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">
                    {m.title}
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {m.selections.map((s) => {
                      const isSelected = selectedIds.has(s.id);
                      const sameMarketBlocked =
                        !isSelected && blockedMarketIds.has(m.id);
                      return (
                        <button
                          type="button"
                          key={s.id}
                          disabled={sameMarketBlocked}
                          onClick={() =>
                            toggle({
                              selectionId: s.id,
                              marketId: m.id,
                              groupKey: g.key,
                              groupLabel: g.label,
                              marketTitle: m.title,
                              selectionLabel: s.label,
                              odds: s.finalOdds,
                            })
                          }
                          className={`group flex cursor-pointer items-center justify-between gap-2 rounded-md border px-3 py-2 text-left shadow-[var(--shadow-card)] transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-card-hover)] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none disabled:hover:translate-y-0 ${
                            isSelected
                              ? "border-emerald-500/70 bg-emerald-500/10"
                              : "border-border bg-card-elevated hover:border-foreground/30 hover:bg-accent"
                          }`}
                          title={
                            sameMarketBlocked
                              ? "Z jednoho trhu nelze sázet dva výběry najednou"
                              : undefined
                          }
                        >
                          <span className="truncate text-sm">{s.label}</span>
                          <span
                            className={`font-mono text-base font-bold tabular-nums ${
                              isSelected ? "text-emerald-400" : "text-foreground"
                            }`}
                          >
                            {s.finalOdds.toFixed(2)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      <aside className="lg:sticky lg:top-4 lg:order-2 lg:self-start">
        <Card className="border-foreground/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Slip</CardTitle>
            <Badge variant="secondary">{slip.length}</Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            {slip.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Vyber 2 nebo více výběrů. Z každého trhu maximálně jeden.
              </p>
            ) : (
              <ul className="space-y-2">
                {slip.map((s) => (
                  <li
                    key={s.selectionId}
                    className="flex items-start justify-between gap-2 rounded-md border bg-muted/30 p-2 text-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs text-muted-foreground">
                        {s.groupLabel} · {s.marketTitle}
                      </p>
                      <p className="truncate font-medium">{s.selectionLabel}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-foreground">
                        {s.odds.toFixed(2)}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setSlip((p) =>
                            p.filter((x) => x.selectionId !== s.selectionId)
                          )
                        }
                        className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        aria-label="Odebrat"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <div className="space-y-1 border-t pt-3 text-sm">
              <Row label="Výběrů" value={String(slip.length)} />
              <Row
                label="Celkový kurz"
                value={slip.length > 0 ? combinedOdds.toFixed(2) : "—"}
                bold
              />
            </div>

            <div className="space-y-2 pt-2">
              <Label htmlFor="stake">Vklad</Label>
              <Input
                id="stake"
                type="number"
                inputMode="decimal"
                min={1}
                max={maxStake}
                step="1"
                value={stake}
                onChange={(e) => setStake(e.target.value)}
                placeholder={`max ${fmt.format(maxStake)}`}
              />
              <p className="text-xs text-muted-foreground">
                Kapitál: {formatJablka(capital)}
                {maxBet != null && <> · max sázka {fmt.format(maxBet)}</>}
              </p>
            </div>

            <div className="rounded-md border bg-muted/40 p-3 text-sm">
              <p className="flex items-center justify-between">
                <span className="text-muted-foreground">Možná výhra</span>
                <span className="font-mono text-lg font-bold text-emerald-400">
                  {potential > 0 ? fmt.format(potential) : "—"}
                </span>
              </p>
            </div>

            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={slip.length === 0 || pending}
                onClick={clearSlip}
                className="flex-1"
              >
                <Trash2 className="mr-1 h-4 w-4" />
                Vyprázdnit
              </Button>
              <Button
                size="sm"
                disabled={!canSubmit}
                onClick={submit}
                className="flex-1"
              >
                {pending ? "Podávám…" : "Podat akumulátor"}
              </Button>
            </div>
            {stakeNum > 0 && stakeNum > maxStake && (
              <p className="text-xs text-destructive">
                Vklad přesahuje maximum {fmt.format(maxStake)}
              </p>
            )}
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}

function Row({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-mono ${bold ? "text-base font-bold" : ""}`}>
        {value}
      </span>
    </div>
  );
}
