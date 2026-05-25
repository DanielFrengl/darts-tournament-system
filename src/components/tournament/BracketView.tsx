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

const CARD_WIDTH = 220;
const CARD_HEIGHT = 70;
const GAP_X = 56;
const GAP_Y = 24;

export function BracketView({
  matches,
  variant = "default",
}: {
  matches: BracketMatchVM[];
  variant?: "default" | "tv";
}) {
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
    return <p className="text-muted-foreground">Pavouk zatím nebyl vytvořen.</p>;
  }

  // Layout: each round's matches are vertically centered with spacing
  // that doubles each round so winners line up between their two sources.
  const firstRoundCount = byPhase.get(phases[0]!)!.length;
  const totalHeight = firstRoundCount * (CARD_HEIGHT + GAP_Y) + GAP_Y;
  const totalWidth = phases.length * (CARD_WIDTH + GAP_X) - GAP_X;

  const positions: { match: BracketMatchVM; x: number; y: number }[] = [];
  for (let pi = 0; pi < phases.length; pi++) {
    const phase = phases[pi]!;
    const list = byPhase.get(phase)!;
    const sliceHeight = totalHeight / list.length;
    for (let i = 0; i < list.length; i++) {
      const match = list[i]!;
      const x = pi * (CARD_WIDTH + GAP_X);
      const y = i * sliceHeight + sliceHeight / 2 - CARD_HEIGHT / 2;
      positions.push({ match, x, y });
    }
  }

  // Build connector segments between consecutive rounds
  const connectors: { d: string; key: string }[] = [];
  for (let pi = 0; pi < phases.length - 1; pi++) {
    const left = byPhase.get(phases[pi]!)!;
    const right = byPhase.get(phases[pi + 1]!)!;
    for (let i = 0; i < right.length; i++) {
      const a = left[i * 2];
      const b = left[i * 2 + 1];
      const target = right[i];
      if (!target) continue;
      const targetPos = positions.find((p) => p.match.id === target.id)!;
      const targetX = targetPos.x;
      const targetY = targetPos.y + CARD_HEIGHT / 2;
      for (const source of [a, b]) {
        if (!source) continue;
        const sourcePos = positions.find((p) => p.match.id === source.id)!;
        const sx = sourcePos.x + CARD_WIDTH;
        const sy = sourcePos.y + CARD_HEIGHT / 2;
        const midX = sx + GAP_X / 2;
        connectors.push({
          key: `${source.id}-${target.id}`,
          d: `M ${sx} ${sy} H ${midX} V ${targetY} H ${targetX}`,
        });
      }
    }
  }

  const isTv = variant === "tv";

  return (
    <div className="space-y-6">
      <div className="overflow-x-auto pb-4">
        <div className="relative" style={{ width: totalWidth, height: totalHeight }}>
          <svg
            className="absolute inset-0 pointer-events-none"
            width={totalWidth}
            height={totalHeight}
          >
            {connectors.map((c) => (
              <path
                key={c.key}
                d={c.d}
                fill="none"
                stroke={isTv ? "rgba(255,255,255,0.25)" : "var(--border)"}
                strokeWidth={2}
              />
            ))}
          </svg>
          {/* Phase labels */}
          <div className="absolute inset-x-0 top-0 flex">
            {phases.map((p, i) => (
              <div
                key={p}
                style={{
                  position: "absolute",
                  left: i * (CARD_WIDTH + GAP_X),
                  width: CARD_WIDTH,
                  top: -28,
                }}
                className={`text-center text-xs font-semibold uppercase tracking-wider ${isTv ? "text-white/60" : "text-muted-foreground"}`}
              >
                {PHASE_LABEL[p]}
              </div>
            ))}
          </div>
          {positions.map(({ match, x, y }) => (
            <div
              key={match.id}
              style={{
                position: "absolute",
                left: x,
                top: y,
                width: CARD_WIDTH,
                height: CARD_HEIGHT,
              }}
            >
              <MatchSlot match={match} variant={variant} />
            </div>
          ))}
        </div>
      </div>
      {thirdPlace && thirdPlace.length > 0 && (
        <div className="max-w-sm space-y-2">
          <h3
            className={`text-xs font-semibold uppercase tracking-wider ${isTv ? "text-white/60" : "text-muted-foreground"}`}
          >
            {PHASE_LABEL.third_place}
          </h3>
          <MatchSlot match={thirdPlace[0]!} variant={variant} />
        </div>
      )}
    </div>
  );
}

function MatchSlot({
  match,
  variant,
}: {
  match: BracketMatchVM;
  variant: "default" | "tv";
}) {
  const isTv = variant === "tv";
  const isLive = match.status === "live";
  const cardClass = isTv
    ? `flex h-full flex-col justify-center rounded-lg border bg-white/5 px-3 py-1.5 shadow-sm ${isLive ? "border-red-400/60" : "border-white/15"}`
    : `flex h-full flex-col justify-center rounded-lg border bg-card px-3 py-1.5 shadow-sm ${isLive ? "border-primary" : "border-border"}`;
  return (
    <div className={cardClass}>
      <SlotLine
        name={match.playerA?.name ?? "—"}
        score={match.scoreA}
        winner={match.winnerId === match.playerA?.id}
        isTv={isTv}
      />
      <div className={isTv ? "my-1 border-t border-white/10" : "my-1 border-t"} />
      <SlotLine
        name={match.playerB?.name ?? "—"}
        score={match.scoreB}
        winner={match.winnerId === match.playerB?.id}
        isTv={isTv}
      />
      <div
        className={`mt-1 text-right text-[10px] uppercase tracking-wider ${isTv ? "text-white/40" : "text-muted-foreground"}`}
      >
        {statusLabel(match.status)}
      </div>
    </div>
  );
}

function SlotLine({
  name,
  score,
  winner,
  isTv,
}: {
  name: string;
  score: number;
  winner: boolean;
  isTv: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between text-sm ${winner ? "font-bold" : ""} ${isTv && !winner ? "text-white/70" : ""}`}
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
