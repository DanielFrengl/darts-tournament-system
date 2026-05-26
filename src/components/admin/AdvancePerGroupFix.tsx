"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { updateAdvancePerGroup } from "@/app/admin/tournaments/[id]/actions";

const VALID_TOTALS = [2, 4, 8, 16];

export function AdvancePerGroupFix({
  tournamentId,
  groupCount,
  currentAdvance,
  groupSize,
}: {
  tournamentId: string;
  groupCount: number;
  currentAdvance: number;
  groupSize: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const currentTotal = groupCount * currentAdvance;
  const isValid = VALID_TOTALS.includes(currentTotal);

  // Suggest values that are valid given groupCount & groupSize.
  const suggestions: number[] = [];
  for (let v = 1; v <= groupSize; v++) {
    const total = v * groupCount;
    if (VALID_TOTALS.includes(total)) suggestions.push(v);
  }

  const [picked, setPicked] = useState<number | null>(null);

  function save(value: number) {
    setPicked(value);
    start(async () => {
      const r = await updateAdvancePerGroup(tournamentId, value);
      if (!r.ok) {
        toast.error(r.error);
        setPicked(null);
        return;
      }
      toast.success("Konfigurace upravena");
      router.refresh();
    });
  }

  if (isValid) return null;

  return (
    <div className="rounded-lg border border-yellow-500/40 bg-yellow-500/5 p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-500" />
        <div className="flex-1 space-y-2 text-sm">
          <p className="font-medium">
            Konfigurace pavouka není kompletní
          </p>
          <p className="text-muted-foreground">
            Aktuálně postupuje {currentAdvance} hráčů ze skupiny × {groupCount}{" "}
            skupiny = <span className="font-mono">{currentTotal}</span>. To
            nelze rozdělit do pavouka — potřeba 2, 4, 8 nebo 16 celkem.
          </p>
          {suggestions.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-muted-foreground">Vyber jinou hodnotu:</span>
              {suggestions.map((v) => (
                <Button
                  key={v}
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => save(v)}
                >
                  {picked === v && pending ? "…" : `${v}/sk. → ${v * groupCount}`}
                </Button>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">
              S aktuálním počtem skupin ({groupCount}) a velikostí skupiny (
              {groupSize}) bohužel není žádná validní volba. Smaž turnaj a
              nastav jinak.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
