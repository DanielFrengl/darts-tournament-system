import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export type GroupTableRow = {
  rank: number;
  playerId: string;
  playerName: string;
  played: number;
  won: number;
  lost: number;
  legsFor: number;
  legsAgainst: number;
  points: number;
  advancing: boolean;
};

export function GroupTable({
  groupName,
  rows,
}: {
  groupName: string;
  rows: GroupTableRow[];
}) {
  return (
    <div className="space-y-2">
      <h3 className="text-lg font-semibold">Skupina {groupName}</h3>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>#</TableHead>
            <TableHead>Hráč</TableHead>
            <TableHead className="text-right">Z</TableHead>
            <TableHead className="text-right">V</TableHead>
            <TableHead className="text-right">P</TableHead>
            <TableHead className="text-right">Legy</TableHead>
            <TableHead className="text-right">Body</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.playerId}>
              <TableCell className="font-mono">{r.rank}</TableCell>
              <TableCell className="font-medium">
                <span className="inline-flex items-center gap-2">
                  {r.playerName}
                  {r.advancing && <Badge variant="default">→</Badge>}
                </span>
              </TableCell>
              <TableCell className="text-right">{r.played}</TableCell>
              <TableCell className="text-right">{r.won}</TableCell>
              <TableCell className="text-right">{r.lost}</TableCell>
              <TableCell className="text-right font-mono">
                {r.legsFor}:{r.legsAgainst}
              </TableCell>
              <TableCell className="text-right font-mono font-bold">{r.points}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="text-xs text-muted-foreground">
        Z = zápasy · V = výhry · P = prohry · Legy = vyhrané : prohrané ·
        Body = za výhru &nbsp;<span className="align-middle"><Badge variant="default" className="px-1 py-0">→</Badge></span>&nbsp; postupuje dál
      </p>
    </div>
  );
}
