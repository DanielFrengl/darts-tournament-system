"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  startGroups,
  createBracket,
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

  function run(fn: (id: string) => Promise<{ ok: boolean; error?: string }>) {
    start(async () => {
      const r = await fn(tournamentId);
      if (r.ok) {
        toast.success("Hotovo");
        router.refresh();
      } else {
        toast.error(r.error ?? "Akce selhala");
      }
    });
  }

  return (
    <div className="flex gap-2">
      {status === "draft" && (
        <Button disabled={pending} onClick={() => run(startGroups)}>
          Spustit skupiny
        </Button>
      )}
      {status === "groups" && (
        <Button disabled={pending} onClick={() => run(createBracket)}>
          Vytvořit pavouka
        </Button>
      )}
      {status === "playoff" && (
        <Button disabled={pending} onClick={() => run(finishTournament)}>
          Ukončit turnaj
        </Button>
      )}
      {status === "finished" && (
        <span className="text-sm text-muted-foreground">Turnaj dokončen</span>
      )}
    </div>
  );
}
