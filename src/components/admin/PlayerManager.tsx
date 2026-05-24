"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  addPlayer,
  removePlayer,
  assignPlayerToGroup,
  autoAssignPlayers,
} from "@/app/admin/tournaments/[id]/players/actions";

type Player = { id: string; name: string; groupId: string | null };
type Group = { id: string; name: string };

export function PlayerManager({
  tournamentId,
  players,
  groups,
  editable,
}: {
  tournamentId: string;
  players: Player[];
  groups: Group[];
  editable: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [pending, start] = useTransition();

  function onAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    start(async () => {
      const r = await addPlayer(tournamentId, name);
      if (r.ok) {
        toast.success(`Přidán: ${name}`);
        setName("");
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  function onRemove(id: string) {
    start(async () => {
      const r = await removePlayer(tournamentId, id);
      if (r.ok) {
        toast.success("Odstraněn");
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  function onAssign(playerId: string, groupId: string | null) {
    start(async () => {
      const r = await assignPlayerToGroup(tournamentId, playerId, groupId);
      if (r.ok) {
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  function onAuto() {
    start(async () => {
      const r = await autoAssignPlayers(tournamentId);
      if (r.ok) {
        toast.success("Hráči rozděleni");
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <div className="space-y-4">
      {editable && (
        <>
          <form onSubmit={onAdd} className="flex gap-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jméno hráče"
              required
              maxLength={80}
            />
            <Button type="submit" disabled={pending || !name.trim()}>
              Přidat
            </Button>
          </form>
          <Button variant="outline" disabled={pending || players.length === 0} onClick={onAuto}>
            Náhodně rozdělit do skupin
          </Button>
        </>
      )}
      <ul className="space-y-2">
        {players.map((p) => (
          <li key={p.id} className="flex items-center gap-3 rounded border p-2">
            <span className="flex-1 font-medium">{p.name}</span>
            {editable ? (
              <select
                value={p.groupId ?? ""}
                onChange={(e) => onAssign(p.id, e.target.value || null)}
                className="rounded border bg-background px-2 py-1 text-sm"
              >
                <option value="">— bez skupiny —</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    Skupina {g.name}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-sm text-muted-foreground">
                {groups.find((g) => g.id === p.groupId)?.name ?? "—"}
              </span>
            )}
            {editable && (
              <Button size="sm" variant="ghost" onClick={() => onRemove(p.id)}>
                Smazat
              </Button>
            )}
          </li>
        ))}
        {players.length === 0 && (
          <li className="text-sm text-muted-foreground">Žádní hráči.</li>
        )}
      </ul>
    </div>
  );
}
