"use client";

import * as React from "react";
import { useTransition } from "react";
import { toast } from "sonner";
import { Lock } from "lucide-react";
import {
  linkAction,
  recomputeOddsAction,
  setEloAction,
  unlockEloAction,
  createNewcomerForUserAction,
} from "@/app/admin/competitors/actions";
import { UserLink } from "@/components/user/UserLink";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

interface CompetitorRow {
  id: string;
  displayName: string;
  eloRating: number;
  eloLocked: boolean;
  userId: string | null;
  linkedUsername: string | null;
}

interface UserOption {
  id: string;
  label: string;
}

/**
 * The one native control the design system has no wrapper for. Styled off the
 * same tokens as `Input` so it doesn't read as a stray browser widget.
 */
function Select({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "h-8 rounded-lg border border-input bg-transparent px-2 py-1 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 dark:bg-input/30",
        className
      )}
      {...props}
    />
  );
}

export function CompetitorLinker({
  competitors,
  users,
  unpairedUsers,
  activeTournamentId,
}: {
  competitors: CompetitorRow[];
  users: UserOption[];
  unpairedUsers: UserOption[];
  activeTournamentId: string | null;
}) {
  const [busy, start] = useTransition();

  // Every action reports the same way — a toast — instead of one shared line
  // of text next to the recompute button that most of them never reached.
  function run(fn: () => Promise<{ ok: true } | { ok: false; error: string }>, ok: string) {
    start(async () => {
      const res = await fn();
      if (res.ok) toast.success(ok);
      else toast.error(res.error);
    });
  }

  return (
    <div className="space-y-4">
      {unpairedUsers.length > 0 && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Nepřiřazení uživatelé
              <Badge variant="outline">{unpairedUsers.length}</Badge>
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Registrované účty bez soutěžícího. Pokud je to nováček, přidej ho
              na 1500. Existujícího hráče naopak napoj v tabulce níž.
            </p>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {unpairedUsers.map((u) => (
                <li
                  key={u.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2 first:pt-0 last:pb-0"
                >
                  <span className="text-sm">{u.label}</span>
                  <form
                    action={(fd) =>
                      run(
                        () => createNewcomerForUserAction(fd),
                        "Nováček přidán na 1500"
                      )
                    }
                  >
                    <input type="hidden" name="userId" value={u.id} />
                    <Button type="submit" size="sm" variant="outline" disabled={busy}>
                      Přidat jako nováčka (1500)
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {activeTournamentId && (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div className="min-w-0">
              <p className="text-sm font-medium">Kurzy futures trhů</p>
              <p className="text-sm text-muted-foreground">
                Přepočítá vítěze, 2. a 3. místo z aktuálních ratingů. Nejde,
                pokud už na ně někdo vsadil.
              </p>
            </div>
            <form
              action={(fd) =>
                run(() => recomputeOddsAction(fd), "Kurzy přepočítány")
              }
            >
              <input type="hidden" name="tournamentId" value={activeTournamentId} />
              <Button type="submit" disabled={busy}>
                {busy ? "Počítám…" : "Přepočítat kurzy"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Soutěžící ({competitors.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Soutěžící</TableHead>
                <TableHead>Rating</TableHead>
                <TableHead>Účet</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {competitors.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.displayName}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <form
                        action={(fd) => run(() => setEloAction(fd), "Rating uložen")}
                        className="flex items-center gap-1.5"
                      >
                        <input type="hidden" name="competitorId" value={c.id} />
                        <Input
                          name="elo"
                          type="number"
                          defaultValue={c.eloRating}
                          min={0}
                          max={4000}
                          aria-label={`Rating hráče ${c.displayName}`}
                          className="w-20 tabular-nums"
                        />
                        <Button type="submit" size="sm" variant="outline" disabled={busy}>
                          Uložit
                        </Button>
                      </form>
                      {c.eloLocked && (
                        <form
                          action={(fd) =>
                            run(() => unlockEloAction(fd), "Rating odemčen")
                          }
                        >
                          <input type="hidden" name="competitorId" value={c.id} />
                          <Button
                            type="submit"
                            size="sm"
                            variant="ghost"
                            disabled={busy}
                            title="Ručně zamčeno – odemknout pro přepočet z importu"
                            className="gap-1 text-amber-600 dark:text-amber-400"
                          >
                            <Lock className="h-3.5 w-3.5" />
                            odemknout
                          </Button>
                        </form>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {c.userId ? (
                      <UserLink username={c.linkedUsername}>
                        @{c.linkedUsername}
                      </UserLink>
                    ) : (
                      <form
                        action={(fd) => run(() => linkAction(fd), "Účet přiřazen")}
                        className="flex items-center gap-2"
                      >
                        <input type="hidden" name="competitorId" value={c.id} />
                        <Select
                          name="userId"
                          required
                          defaultValue=""
                          aria-label={`Účet pro ${c.displayName}`}
                        >
                          <option value="" disabled>
                            Vyber účet…
                          </option>
                          {users.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.label}
                            </option>
                          ))}
                        </Select>
                        <Button type="submit" size="sm" variant="outline" disabled={busy}>
                          Přiřadit
                        </Button>
                      </form>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {competitors.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
                    Zatím žádní soutěžící. Naimportuj historii skriptem
                    <code className="mx-1">import-history</code>.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
