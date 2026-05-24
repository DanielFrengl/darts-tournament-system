import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export type BetRowVM = {
  id: string;
  placedAt: Date;
  marketLabel: string;
  selectionLabel: string;
  matchId: string | null;
  matchSummary: string;
  stake: string;
  lockedOdds: string;
  status: "open" | "won" | "lost" | "refunded";
  payout: string | null;
};

export function MyBetsTable({ rows }: { rows: BetRowVM[] }) {
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
          <TableHead>Zápas</TableHead>
          <TableHead>Trh / Tip</TableHead>
          <TableHead className="text-right">Vklad</TableHead>
          <TableHead className="text-right">Kurz</TableHead>
          <TableHead>Stav</TableHead>
          <TableHead className="text-right">Výplata</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((b) => (
          <TableRow key={b.id}>
            <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
              {dt.format(b.placedAt)}
            </TableCell>
            <TableCell>
              {b.matchId ? (
                <Link href={`/match/${b.matchId}`} className="underline">
                  {b.matchSummary}
                </Link>
              ) : (
                b.matchSummary
              )}
            </TableCell>
            <TableCell className="text-sm">
              <div>{b.marketLabel}</div>
              <div className="font-medium">{b.selectionLabel}</div>
            </TableCell>
            <TableCell className="text-right font-mono">{fmt.format(Number(b.stake))}</TableCell>
            <TableCell className="text-right font-mono">{Number(b.lockedOdds).toFixed(2)}</TableCell>
            <TableCell>
              <Badge variant={statusVariant(b.status)}>{b.status}</Badge>
            </TableCell>
            <TableCell className="text-right font-mono">
              {b.payout != null ? fmt.format(Number(b.payout)) : "—"}
            </TableCell>
          </TableRow>
        ))}
        {rows.length === 0 && (
          <TableRow>
            <TableCell colSpan={7} className="text-center text-muted-foreground">
              Žádné sázky
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}

function statusVariant(s: BetRowVM["status"]): "default" | "secondary" | "outline" | "destructive" {
  switch (s) {
    case "open":
      return "secondary";
    case "won":
      return "default";
    case "lost":
      return "destructive";
    case "refunded":
      return "outline";
  }
}
