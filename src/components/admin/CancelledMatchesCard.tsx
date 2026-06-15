"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { restoreMatchAction } from "@/app/admin/tournaments/[id]/matches/actions";

export type CancelledMatchVM = {
  id: string;
  number: number;
  phaseLabel: string;
  playerA: string;
  playerB: string;
};

export function CancelledMatchesCard({
  tournamentId,
  matches,
}: {
  tournamentId: string;
  matches: CancelledMatchVM[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  if (matches.length === 0) return null;

  function restore(matchId: string) {
    start(async () => {
      const r = await restoreMatchAction(tournamentId, matchId);
      if (r.ok) {
        toast.success("Zápas vrácen mezi naplánované");
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <Card className="border-dashed">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          Zrušené zápasy
          <Badge variant="secondary">{matches.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border text-sm">
          {matches.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-3 py-2">
              <span className="flex items-center gap-2">
                <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                  #{m.number}
                </span>
                <span>
                  {m.playerA} <span className="text-muted-foreground">vs</span> {m.playerB}
                </span>
                <span className="text-xs uppercase tracking-wider text-muted-foreground">
                  {m.phaseLabel}
                </span>
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => restore(m.id)}
              >
                Vrátit zápas
              </Button>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">
          Vrácení vrátí zápas mezi naplánované a znovu otevře sázky. Funguje jen u
          zápasů, které ještě nezačaly.
        </p>
      </CardContent>
    </Card>
  );
}
