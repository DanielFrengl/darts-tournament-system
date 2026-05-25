"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  addPlayer,
  addPlayerFromUser,
  removePlayer,
  assignPlayerToGroup,
  autoAssignPlayers,
} from "@/app/admin/tournaments/[id]/players/actions";

type Player = {
  id: string;
  name: string;
  groupId: string | null;
  userId: string | null;
  avatarUrl: string | null;
};
type Group = { id: string; name: string };
type AvailableUser = { id: string; username: string; avatarUrl: string | null };

type Mode = "account" | "offline";

export function PlayerManager({
  tournamentId,
  players,
  groups,
  availableUsers,
  editable,
}: {
  tournamentId: string;
  players: Player[];
  groups: Group[];
  availableUsers: AvailableUser[];
  editable: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("account");
  const [name, setName] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [pending, start] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    start(async () => {
      if (mode === "account") {
        if (!selectedUserId) {
          toast.error("Vyber uživatele");
          return;
        }
        const r = await addPlayerFromUser(tournamentId, selectedUserId);
        if (r.ok) {
          toast.success("Hráč přidán z účtu");
          setSelectedUserId("");
          router.refresh();
        } else {
          toast.error(r.error);
        }
      } else {
        if (!name.trim()) {
          toast.error("Zadej jméno");
          return;
        }
        const r = await addPlayer(tournamentId, name);
        if (r.ok) {
          toast.success(`Přidán: ${name}`);
          setName("");
          router.refresh();
        } else {
          toast.error(r.error);
        }
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
    <div className="space-y-6">
      {editable && (
        <>
          <div className="space-y-3">
            <div className="flex gap-2">
              <ModeButton
                active={mode === "account"}
                onClick={() => setMode("account")}
                label="Z registrovaného účtu"
                sub={`${availableUsers.length} k dispozici`}
              />
              <ModeButton
                active={mode === "offline"}
                onClick={() => setMode("offline")}
                label="Offline hráč"
                sub="Jen jméno"
              />
            </div>
            <form onSubmit={onSubmit} className="space-y-3">
              {mode === "account" ? (
                <div className="space-y-2">
                  <Label htmlFor="user">Uživatel</Label>
                  <select
                    id="user"
                    value={selectedUserId}
                    onChange={(e) => setSelectedUserId(e.target.value)}
                    className="w-full rounded border bg-background px-3 py-2 text-sm"
                    required
                  >
                    <option value="">— vyber —</option>
                    {availableUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.username}
                      </option>
                    ))}
                  </select>
                  {availableUsers.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      Všichni registrovaní uživatelé už jsou přidáni.
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="name">Jméno offline hráče</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="např. Karel"
                    required
                    maxLength={80}
                  />
                  <p className="text-xs text-muted-foreground">
                    Offline hráči nemají vlastní účet ani kapitál na sázení.
                  </p>
                </div>
              )}
              <Button
                type="submit"
                disabled={
                  pending ||
                  (mode === "offline" ? !name.trim() : !selectedUserId)
                }
              >
                {pending ? "Přidávám…" : "Přidat hráče"}
              </Button>
            </form>
          </div>
          {players.length > 0 && (
            <Button variant="outline" disabled={pending} onClick={onAuto}>
              Náhodně rozdělit do skupin
            </Button>
          )}
        </>
      )}
      <ul className="space-y-2">
        {players.map((p) => (
          <li key={p.id} className="flex items-center gap-3 rounded border p-2">
            <Avatar className="h-8 w-8">
              {p.avatarUrl && <AvatarImage src={p.avatarUrl} alt={p.name} />}
              <AvatarFallback>{p.name.slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <p className="font-medium">{p.name}</p>
              <p className="text-xs text-muted-foreground">
                {p.userId ? (
                  <Badge variant="outline" className="text-[10px]">
                    Účet
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-[10px]">
                    Offline
                  </Badge>
                )}
              </p>
            </div>
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

function ModeButton({
  active,
  onClick,
  label,
  sub,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  sub: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-lg border p-3 text-left transition-colors ${
        active
          ? "border-primary bg-primary/10"
          : "border-border bg-card hover:border-foreground/30"
      }`}
    >
      <p className="text-sm font-semibold">{label}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>
    </button>
  );
}
