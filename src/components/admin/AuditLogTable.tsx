import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { UserLink } from "@/components/user/UserLink";

export type AuditRow = {
  id: string;
  createdAt: Date;
  username: string;
  type: string;
  amount: string;
  balanceAfter: string;
  note: string | null;
  createdByUsername: string | null;
};

export function AuditLogTable({ rows }: { rows: AuditRow[] }) {
  const fmt = new Intl.NumberFormat("cs-CZ", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const dt = new Intl.DateTimeFormat("cs-CZ", { dateStyle: "short", timeStyle: "short" });
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Čas</TableHead>
          <TableHead>Uživatel</TableHead>
          <TableHead>Typ</TableHead>
          <TableHead className="text-right">Částka</TableHead>
          <TableHead className="text-right">Zůstatek po</TableHead>
          <TableHead>Poznámka</TableHead>
          <TableHead>Provedl admin</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.id}>
            <TableCell className="whitespace-nowrap">{dt.format(r.createdAt)}</TableCell>
            <TableCell>
              <UserLink username={r.username}>{r.username}</UserLink>
            </TableCell>
            <TableCell>
              <Badge variant="outline">{r.type}</Badge>
            </TableCell>
            <TableCell className="text-right font-mono">{fmt.format(Number(r.amount))}</TableCell>
            <TableCell className="text-right font-mono">
              {fmt.format(Number(r.balanceAfter))}
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">{r.note ?? "—"}</TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {r.createdByUsername ? (
                <UserLink username={r.createdByUsername}>
                  {r.createdByUsername}
                </UserLink>
              ) : (
                "—"
              )}
            </TableCell>
          </TableRow>
        ))}
        {rows.length === 0 && (
          <TableRow>
            <TableCell colSpan={7} className="text-center text-muted-foreground">
              Žádné transakce
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
