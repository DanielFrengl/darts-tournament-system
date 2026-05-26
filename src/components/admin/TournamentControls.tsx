"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  startGroups,
  finishTournament,
  createBracket,
} from "@/app/admin/tournaments/[id]/actions";

export function TournamentControls({
  tournamentId,
  status,
  needsBracketFallback = false,
}: {
  tournamentId: string;
  status: "draft" | "groups" | "playoff" | "finished";
  /** True when status=groups, all group matches finished, no playoff matches yet. */
  needsBracketFallback?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function onStartGroups() {
    start(async () => {
      const r = await startGroups(tournamentId);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Skupiny spuštěny");
      // Jump straight into the play view so the admin can start the
      // first match without hunting for it in a list.
      router.push(`/admin/tournaments/${tournamentId}/play`);
    });
  }

  function onFinish() {
    start(async () => {
      const r = await finishTournament(tournamentId);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Turnaj dokončen");
      router.refresh();
    });
  }

  function onCreateBracket() {
    start(async () => {
      const r = await createBracket(tournamentId);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Pavouk vytvořen");
      router.push(`/admin/tournaments/${tournamentId}/play`);
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      {status === "draft" && (
        <Button disabled={pending} onClick={onStartGroups}>
          Spustit skupiny
        </Button>
      )}
      {status === "groups" && !needsBracketFallback && (
        <Button
          variant="default"
          render={
            <a href={`/admin/tournaments/${tournamentId}/play`}>
              Skórovat další zápas →
            </a>
          }
        />
      )}
      {status === "groups" && needsBracketFallback && (
        <Button disabled={pending} onClick={onCreateBracket}>
          Vytvořit pavouka a pokračovat →
        </Button>
      )}
      {status === "playoff" && (
        <>
          <Button
            variant="default"
            render={
              <a href={`/admin/tournaments/${tournamentId}/play`}>
                Skórovat další zápas →
              </a>
            }
          />
          <Button variant="outline" disabled={pending} onClick={onFinish}>
            Ukončit turnaj
          </Button>
        </>
      )}
      {status === "finished" && (
        <span className="text-sm text-muted-foreground">Turnaj dokončen</span>
      )}
    </div>
  );
}
