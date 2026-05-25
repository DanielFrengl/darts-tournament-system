"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  deleteTournament,
  renameTournament,
} from "@/app/admin/tournaments/[id]/actions";

export function TournamentAdminActions({
  tournamentId,
  currentName,
  status,
}: {
  tournamentId: string;
  currentName: string;
  status: "draft" | "groups" | "playoff" | "finished";
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(currentName);

  const canDelete = status === "draft" || status === "finished";

  function onSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    start(async () => {
      const r = await renameTournament(tournamentId, name);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Název změněn");
      setEditing(false);
      router.refresh();
    });
  }

  function onDelete() {
    if (
      !confirm(
        `Opravdu smazat turnaj "${currentName}"?\nTato akce je nevratná.`
      )
    ) {
      return;
    }
    start(async () => {
      const r = await deleteTournament(tournamentId);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Turnaj smazán");
      router.push("/admin/tournaments");
      router.refresh();
    });
  }

  if (editing) {
    return (
      <form onSubmit={onSave} className="flex flex-wrap gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={100}
          className="max-w-xs"
          autoFocus
        />
        <Button type="submit" size="sm" disabled={pending}>
          Uložit
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            setEditing(false);
            setName(currentName);
          }}
        >
          Zrušit
        </Button>
      </form>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => setEditing(true)}
        disabled={pending}
      >
        <Pencil className="mr-1 h-4 w-4" />
        Přejmenovat
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={onDelete}
        disabled={pending || !canDelete}
        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        title={
          canDelete
            ? "Smazat turnaj"
            : "Smazání možné jen v draftu nebo po dohrání"
        }
      >
        <Trash2 className="mr-1 h-4 w-4" />
        Smazat
      </Button>
    </div>
  );
}
