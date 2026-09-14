import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/layout/PageHeader";
import { tournamentService } from "@/lib/tournament";

export default async function AdminTournamentsPage() {
  const list = await tournamentService.list();
  const active = await tournamentService.getActive();
  const dt = new Intl.DateTimeFormat("cs-CZ", { dateStyle: "short", timeStyle: "short" });
  return (
    <div className="space-y-6">
      <PageHeader
        title="Turnaje"
        description="Detail turnaje spravuje hráče, zápasy i mazání."
        actions={
          <Button render={<Link href="/admin/tournaments/new">+ Nový turnaj</Link>} />
        }
      />
      <Card>
        <CardHeader>
          <CardTitle>Všechny turnaje ({list.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {list.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm text-muted-foreground">
                Zatím žádný turnaj.
              </p>
              <Button
                className="mt-3"
                render={
                  <Link href="/admin/tournaments/new">+ Vytvořit první turnaj</Link>
                }
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Název</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Vytvořen</TableHead>
                  <TableHead className="text-right">Akce</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((t) => {
                  const isActive = active?.id === t.id;
                  const isRunning = t.status !== "draft" && t.status !== "finished";
                  return (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">
                        <Link
                          href={`/admin/tournaments/${t.id}`}
                          className="underline-offset-2 hover:underline"
                        >
                          {t.name}
                        </Link>
                        {isActive && (
                          <Badge variant="outline" className="ml-2">
                            Aktivní
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <StatusBadge kind="tournament" status={t.status} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">{dt.format(t.createdAt)}</TableCell>
                      {/* "Spravovat" and the old "Upravit / smazat" both led to
                          the same detail page; one link, plus the scoring
                          shortcut that actually saves a hop. */}
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {isRunning && (
                            <Button
                              size="sm"
                              variant="ghost"
                              render={
                                <Link href={`/admin/tournaments/${t.id}/play`}>
                                  ▶ Skórovat
                                </Link>
                              }
                            />
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            render={
                              <Link href={`/admin/tournaments/${t.id}`}>Spravovat</Link>
                            }
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
