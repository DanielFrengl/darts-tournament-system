"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  startGroups,
  finishTournament,
} from "@/app/admin/tournaments/[id]/actions";

export function TournamentControls({
  tournamentId,
  status,
}: {
  tournamentId: string;
  status: "draft" | "groups" | "playoff" | "finished";
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

  return (
    <div className="flex flex-wrap gap-2">
      {status === "draft" && (
        <Button disabled={pending} onClick={onStartGroups}>
          Spustit skupiny
        </Button>
      )}
      {status === "groups" && (
        <Button
          variant="default"
          render={
            <a href={`/admin/tournaments/${tournamentId}/play`}>
              Skórovat další zápas →
            </a>
          }
        />
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
