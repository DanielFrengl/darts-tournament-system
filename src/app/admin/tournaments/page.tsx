import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { tournamentService } from "@/lib/tournament";

export default async function AdminTournamentsPage() {
  const list = await tournamentService.list();
  const dt = new Intl.DateTimeFormat("cs-CZ", { dateStyle: "short", timeStyle: "short" });
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Turnaje</h1>
        <Button render={<Link href="/admin/tournaments/new">+ Nový turnaj</Link>} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Všechny turnaje</CardTitle>
        </CardHeader>
        <CardContent>
          {list.length === 0 ? (
            <p className="text-sm text-muted-foreground">Žádný turnaj. Vytvoř první.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Název</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Vytvořen</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{t.status}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{dt.format(t.createdAt)}</TableCell>
                    <TableCell>
                      <Button size="sm" variant="ghost" render={<Link href={`/admin/tournaments/${t.id}`}>Spravovat</Link>} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
