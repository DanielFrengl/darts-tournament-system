"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { updatePhaseBestOf } from "@/app/admin/tournaments/[id]/actions";
import type { BestOfPhase } from "@/lib/match-lifecycle";

/** Odd lengths only — a match is first to ceil(bestOf/2). */
const BEST_OF_OPTIONS = [1, 3, 5, 7, 9, 11, 13, 15];

const PHASES: { key: BestOfPhase; label: string; hint?: string }[] = [
  { key: "group", label: "Skupina" },
  { key: "quarter", label: "Čtvrtfinále" },
  { key: "semi", label: "Semifinále", hint: "platí i pro zápas o 3. místo" },
  { key: "final", label: "Finále" },
];

export function RoundLengthCard({
  tournamentId,
  bestOf,
}: {
  tournamentId: string;
  bestOf: Record<BestOfPhase, number>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function change(phase: BestOfPhase, label: string, value: number) {
    if (value === bestOf[phase]) return;
    if (
      !confirm(
        `Hrát ${label.toLowerCase()} na best of ${value}?\nUž rozehrané zápasy si nechají svou délku. U nezahájených se vrátí otevřené sázky na vítěze zápasu a přesné skóre — při jiném počtu legů platí jiná skóre.`
      )
    ) {
      return;
    }
    start(async () => {
      const r = await updatePhaseBestOf(tournamentId, phase, value);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      const notes: string[] = [`${label}: best of ${value}`];
      if (r.updated > 0) notes.push(`${r.updated} zápasů přepsáno`);
      if (r.refunded > 0) notes.push(`${r.refunded} sázek vráceno`);
      if (r.skipped > 0) notes.push(`${r.skipped} už rozehraných beze změny`);
      toast.success(notes.join(" · "));
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Počet legů</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          Změna platí pro kola, která se ještě nezačala hrát — včetně těch,
          která ještě nejsou vylosovaná. Semifinále tak jde prodloužit dřív,
          než ho čtvrtfinále vůbec obsadí.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {PHASES.map((p) => (
            <label
              key={p.key}
              className="flex items-center justify-between gap-3 rounded border p-2"
            >
              <span>
                {p.label}
                {p.hint && (
                  <span className="block text-xs text-muted-foreground">
                    {p.hint}
                  </span>
                )}
              </span>
              <select
                value={bestOf[p.key]}
                disabled={pending}
                onChange={(e) => change(p.key, p.label, Number(e.target.value))}
                className="rounded border bg-background px-2 py-1 text-sm"
                aria-label={`Počet legů — ${p.label}`}
              >
                {BEST_OF_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    best of {n}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
