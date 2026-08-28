"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { resyncRatings } from "@/app/admin/tournaments/[id]/actions";

export function RatingResyncCard({
  tournamentId,
  flatRatings,
}: {
  tournamentId: string;
  /** Every player sits on the same rating — the symptom this card fixes. */
  flatRatings: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function run() {
    start(async () => {
      const r = await resyncRatings(tournamentId);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      const notes = [`${r.players} hráčů`];
      if (r.linked > 0) notes.push(`${r.linked} nově spárováno`);
      if (r.replayed > 0) notes.push(`${r.replayed} zápasů přehráno`);
      notes.push(`${r.repriced} trhů přeceněno`);
      toast.success(notes.join(" · "));
      router.refresh();
    });
  }

  return (
    <Card className={flatRatings ? "border-yellow-500/40 bg-yellow-500/5" : ""}>
      <CardHeader>
        <CardTitle>Rating hráčů</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {flatRatings ? (
          <p>
            Všichni hráči mají stejný rating, takže každý zápas vychází 50 : 50
            a celá nabídka stojí na kurzu 2.00. Načti hráčům jejich přenášený
            rating z databáze soutěžících a přepočítej otevřené kurzy.
          </p>
        ) : (
          <p className="text-muted-foreground">
            Načte hráčům přenášený rating z databáze soutěžících, přehraje
            odehrané zápasy tohoto turnaje a přecení otevřené trhy.
          </p>
        )}
        <p className="text-muted-foreground">
          Už uzavřené sázky si drží kurz, na který byly uzavřené.
        </p>
        <Button size="sm" disabled={pending} onClick={run}>
          <RefreshCw className="mr-1 h-4 w-4" />
          {pending ? "Přepočítávám…" : "Načíst rating a přecenit kurzy"}
        </Button>
      </CardContent>
    </Card>
  );
}
