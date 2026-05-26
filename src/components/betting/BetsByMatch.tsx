import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { LiveDot } from "@/components/ui/live-dot";
import { BetStatusBadge, type BetStatus } from "./BetStatusBadge";

export type BetEntry = {
  id: string;
  placedAt: Date;
  marketLabel: string;
  selectionLabel: string;
  stake: string;
  lockedOdds: string;
  status: BetStatus;
  payout: string | null;
};

export type MatchGroupVM = {
  matchId: string | null;
  matchSummary: string;
  matchScore: string | null;
  matchStatus: "scheduled" | "live" | "finished" | "cancelled" | null;
  phaseLabel: string | null;
  bets: BetEntry[];
  totalStake: number;
  totalReturn: number;
  netResult: number;
};

export function BetsByMatch({ groups }: { groups: MatchGroupVM[] }) {
  if (groups.length === 0) {
    return null;
  }
  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <MatchGroupCard key={g.matchId ?? g.matchSummary} group={g} />
      ))}
    </div>
  );
}

function MatchGroupCard({ group }: { group: MatchGroupVM }) {
  const fmt = new Intl.NumberFormat("cs-CZ", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const dt = new Intl.DateTimeFormat("cs-CZ", { timeStyle: "short" });
  const allSettled = group.bets.every((b) => b.status !== "open");
  const Inner = (
    <Card
      className={
        group.matchId
          ? "transition-colors hover:border-foreground/30 hover:bg-accent/30"
          : undefined
      }
    >
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            {group.phaseLabel && (
              <Badge variant="outline">{group.phaseLabel}</Badge>
            )}
            {group.matchStatus && <MatchStatusBadge status={group.matchStatus} />}
          </div>
          <p className="text-lg font-semibold">
            {group.matchSummary}
            {group.matchScore && (
              <span className="ml-3 font-mono text-muted-foreground">
                {group.matchScore}
              </span>
            )}
          </p>
        </div>
        <div className="text-right text-sm">
          <p className="text-muted-foreground">
            Vsazeno: <span className="font-mono">{fmt.format(group.totalStake)}</span>
          </p>
          {allSettled && (
            <p
              className={
                group.netResult > 0
                  ? "text-emerald-400"
                  : group.netResult < 0
                    ? "text-destructive"
                    : "text-muted-foreground"
              }
            >
              Výsledek:{" "}
              <span className="font-mono font-semibold">
                {group.netResult > 0 ? "+" : ""}
                {fmt.format(group.netResult)}
              </span>
            </p>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border">
          {group.bets.map((b) => (
            <li
              key={b.id}
              className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
            >
              <div className="min-w-0 flex-1">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {b.marketLabel} · {dt.format(b.placedAt)}
                </p>
                <p className="font-medium">{b.selectionLabel}</p>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <div className="text-right">
                  <p className="text-muted-foreground">
                    Vklad{" "}
                    <span className="font-mono text-foreground">
                      {fmt.format(Number(b.stake))}
                    </span>
                  </p>
                  <p className="text-muted-foreground">
                    Kurz{" "}
                    <span className="font-mono text-foreground">
                      {Number(b.lockedOdds).toFixed(2)}
                    </span>
                  </p>
                </div>
                <div className="text-right">
                  <BetStatusBadge status={b.status} />
                  {b.payout != null && (
                    <p
                      className={`mt-1 font-mono ${
                        b.status === "won"
                          ? "text-emerald-400"
                          : b.status === "refunded"
                            ? ""
                            : "text-muted-foreground"
                      }`}
                    >
                      {fmt.format(Number(b.payout))}
                    </p>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );

  if (group.matchId) {
    return (
      <Link href={`/match/${group.matchId}`} className="block">
        {Inner}
      </Link>
    );
  }
  return Inner;
}

function MatchStatusBadge({
  status,
}: {
  status: "scheduled" | "live" | "finished" | "cancelled";
}) {
  if (status === "live")
    return (
      <Badge className="flex items-center gap-1.5">
        <LiveDot size="sm" />
        Živě
      </Badge>
    );
  if (status === "finished") return <Badge variant="secondary">Dohráno</Badge>;
  if (status === "cancelled") return <Badge variant="destructive">Zrušeno</Badge>;
  return <Badge variant="outline">Naplánováno</Badge>;
}
