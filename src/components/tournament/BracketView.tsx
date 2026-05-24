import type { ReactNode } from "react";

export type BracketMatchVM = {
  id: string;
  phase: "quarter" | "semi" | "final" | "third_place";
  bracketPosition: number;
  playerA: { id: string; name: string } | null;
  playerB: { id: string; name: string } | null;
  scoreA: number;
  scoreB: number;
  status: "scheduled" | "live" | "finished" | "cancelled";
  winnerId: string | null;
};

const PHASE_ORDER: BracketMatchVM["phase"][] = ["quarter", "semi", "final"];
const PHASE_LABEL: Record<BracketMatchVM["phase"], string> = {
  quarter: "Čtvrtfinále",
  semi: "Semifinále",
  final: "Finále",
  third_place: "O 3. místo",
};

export function BracketView({ matches }: { matches: BracketMatchVM[] }) {
  const byPhase = new Map<BracketMatchVM["phase"], BracketMatchVM[]>();
  for (const m of matches) {
    const arr = byPhase.get(m.phase) ?? [];
    arr.push(m);
    byPhase.set(m.phase, arr);
  }
  for (const arr of byPhase.values()) {
    arr.sort((a, b) => a.bracketPosition - b.bracketPosition);
  }

  const phases = PHASE_ORDER.filter((p) => byPhase.has(p));
  const thirdPlace = byPhase.get("third_place");

  if (phases.length === 0) {
    return (
      <p className="text-muted-foreground">Pavouk zatím nebyl vytvořen.</p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-6 overflow-x-auto pb-4">
        {phases.map((phase) => (
          <PhaseColumn
            key={phase}
            label={PHASE_LABEL[phase]}
            matches={byPhase.get(phase)!}
          />
        ))}
      </div>
      {thirdPlace && thirdPlace.length > 0 && (
        <div className="max-w-sm">
          <PhaseColumn label={PHASE_LABEL.third_place} matches={thirdPlace} />
        </div>
      )}
    </div>
  );
}

function PhaseColumn({ label, matches }: { label: string; matches: BracketMatchVM[] }) {
  return (
    <div className="flex min-w-56 flex-col gap-3">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </h3>
      <div className="flex flex-1 flex-col justify-around gap-4">
        {matches.map((m) => (
          <MatchSlot key={m.id} match={m} />
        ))}
      </div>
    </div>
  );
}

function MatchSlot({ match }: { match: BracketMatchVM }) {
  return (
    <div className="rounded border bg-card p-2 shadow-sm">
      <SlotLine
        name={match.playerA?.name ?? "—"}
        score={match.scoreA}
        winner={match.winnerId === match.playerA?.id}
      />
      <div className="my-1 border-t" />
      <SlotLine
        name={match.playerB?.name ?? "—"}
        score={match.scoreB}
        winner={match.winnerId === match.playerB?.id}
      />
      <div className="mt-1 text-right text-xs text-muted-foreground">{statusLabel(match.status)}</div>
    </div>
  );
}

function SlotLine({
  name,
  score,
  winner,
}: {
  name: string;
  score: number;
  winner: boolean;
}): ReactNode {
  return (
    <div
      className={`flex items-center justify-between text-sm ${winner ? "font-bold" : ""}`}
    >
      <span className="truncate">{name}</span>
      <span className="ml-2 font-mono">{score}</span>
    </div>
  );
}

function statusLabel(status: BracketMatchVM["status"]): string {
  switch (status) {
    case "scheduled":
      return "naplánováno";
    case "live":
      return "živě";
    case "finished":
      return "hotovo";
    case "cancelled":
      return "zrušeno";
  }
}
