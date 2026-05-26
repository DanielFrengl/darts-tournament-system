import { LiveDot } from "@/components/ui/live-dot";

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
const PHASE_SHORT: Record<BracketMatchVM["phase"], string> = {
  quarter: "Q",
  semi: "SF",
  final: "F",
  third_place: "3.",
};

const CARD_WIDTH = 230;
const CARD_HEIGHT = 92;
const GAP_X = 64;
const GAP_Y = 28;
const PHASE_LABEL_H = 32;

type Slot = {
  /** position index within the round (0-based). */
  index: number;
  /** real match data when it exists. */
  match: BracketMatchVM | null;
  /** rendered placeholder names when match is null. */
  placeholderA?: string;
  placeholderB?: string;
};

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
  const thirdPlace = byPhase.get("third_place");

  // Determine bracket size from the first phase that has matches.
  // 4 quarters → 2 semis → 1 final; 2 semis → 1 final; just final.
  const firstPhase: BracketMatchVM["phase"] | null = byPhase.has("quarter")
    ? "quarter"
    : byPhase.has("semi")
      ? "semi"
      : byPhase.has("final")
        ? "final"
        : null;

  if (!firstPhase) {
    return (
      <p className="text-sm text-muted-foreground">
        Pavouk zatím nebyl vytvořen.
      </p>
    );
  }

  // Build full scaffold so all rounds render even when later matches
  // haven't been seeded yet.
  const phases = PHASE_ORDER.slice(PHASE_ORDER.indexOf(firstPhase));
  const sizes: Record<BracketMatchVM["phase"], number> = {
    quarter: 0,
    semi: 0,
    final: 0,
    third_place: 0,
  };
  sizes[firstPhase] = byPhase.get(firstPhase)!.length;
  for (let i = 1; i < phases.length; i++) {
    const prev = phases[i - 1]!;
    sizes[phases[i]!] = Math.ceil(sizes[prev] / 2);
  }

  // Build slot grid keyed by phase, with placeholders for missing matches.
  const slotsByPhase = new Map<BracketMatchVM["phase"], Slot[]>();
  for (const phase of phases) {
    const real = byPhase.get(phase) ?? [];
    const slots: Slot[] = [];
    for (let i = 0; i < sizes[phase]; i++) {
      const m = real.find((r) => r.bracketPosition === i) ?? real[i] ?? null;
      const prevPhase = PHASE_ORDER[PHASE_ORDER.indexOf(phase) - 1];
      let placeholderA: string | undefined;
      let placeholderB: string | undefined;
      if (!m && prevPhase) {
        const short = PHASE_SHORT[prevPhase];
        placeholderA = `Vítěz ${short}${i * 2 + 1}`;
        placeholderB = `Vítěz ${short}${i * 2 + 2}`;
      } else if (!m && phase === firstPhase) {
        placeholderA = "—";
        placeholderB = "—";
      }
      slots.push({ index: i, match: m, placeholderA, placeholderB });
    }
    slotsByPhase.set(phase, slots);
  }

  // Layout: each round vertically centered with proportional spacing.
  const firstRoundCount = sizes[firstPhase];
  const totalHeight =
    firstRoundCount * (CARD_HEIGHT + GAP_Y) + GAP_Y;
  const totalWidth = phases.length * (CARD_WIDTH + GAP_X) - GAP_X;

  const positions: { slot: Slot; phase: BracketMatchVM["phase"]; x: number; y: number }[] = [];
  for (let pi = 0; pi < phases.length; pi++) {
    const phase = phases[pi]!;
    const list = slotsByPhase.get(phase)!;
    const sliceHeight = totalHeight / list.length;
    for (let i = 0; i < list.length; i++) {
      const slot = list[i]!;
      const x = pi * (CARD_WIDTH + GAP_X);
      const y = i * sliceHeight + sliceHeight / 2 - CARD_HEIGHT / 2;
      positions.push({ slot, phase, x, y });
    }
  }

  function posFor(phase: BracketMatchVM["phase"], index: number) {
    return positions.find((p) => p.phase === phase && p.slot.index === index);
  }

  // Connector segments between consecutive rounds (always drawn from the
  // round structure, regardless of whether matches exist yet).
  const connectors: { d: string; key: string }[] = [];
  for (let pi = 0; pi < phases.length - 1; pi++) {
    const leftPhase = phases[pi]!;
    const rightPhase = phases[pi + 1]!;
    const right = slotsByPhase.get(rightPhase)!;
    for (let i = 0; i < right.length; i++) {
      const target = posFor(rightPhase, i);
      if (!target) continue;
      const targetX = target.x;
      const targetY = target.y + CARD_HEIGHT / 2;
      for (const sourceIdx of [i * 2, i * 2 + 1]) {
        const source = posFor(leftPhase, sourceIdx);
        if (!source) continue;
        const sx = source.x + CARD_WIDTH;
        const sy = source.y + CARD_HEIGHT / 2;
        const midX = sx + GAP_X / 2;
        connectors.push({
          key: `${leftPhase}-${sourceIdx}-${rightPhase}-${i}`,
          d: `M ${sx} ${sy} H ${midX} V ${targetY} H ${targetX}`,
        });
      }
    }
  }

  const isTv = variant === "tv";

  return (
    <div className="space-y-6">
      <div className="overflow-x-auto pb-2">
        <div
          className="relative"
          style={{
            width: totalWidth,
            height: totalHeight + PHASE_LABEL_H,
            paddingTop: PHASE_LABEL_H,
          }}
        >
          {/* Phase labels */}
          <div className="absolute inset-x-0 top-0 flex">
            {phases.map((p, i) => (
              <div
                key={p}
                style={{
                  position: "absolute",
                  left: i * (CARD_WIDTH + GAP_X),
                  width: CARD_WIDTH,
                  top: 6,
                }}
                className={`text-center text-xs font-semibold uppercase tracking-wider ${isTv ? "text-white/60" : "text-muted-foreground"}`}
              >
                {PHASE_LABEL[p]}
              </div>
            ))}
          </div>
          <div className="relative" style={{ width: totalWidth, height: totalHeight }}>
            <svg
              className="pointer-events-none absolute inset-0"
              width={totalWidth}
              height={totalHeight}
            >
              {connectors.map((c) => (
                <path
                  key={c.key}
                  d={c.d}
                  fill="none"
                  stroke={isTv ? "rgba(255,255,255,0.35)" : "var(--border)"}
                  strokeWidth={isTv ? 2.5 : 2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}
            </svg>
            {positions.map(({ slot, x, y }, idx) => (
              <div
                key={idx}
                style={{
                  position: "absolute",
                  left: x,
                  top: y,
                  width: CARD_WIDTH,
                  height: CARD_HEIGHT,
                }}
              >
                <MatchSlot slot={slot} variant={variant} />
              </div>
            ))}
          </div>
        </div>
      </div>
      {thirdPlace && thirdPlace.length > 0 && (
        <div className="max-w-xs space-y-2">
          <h3
            className={`text-xs font-semibold uppercase tracking-wider ${isTv ? "text-white/60" : "text-muted-foreground"}`}
          >
            {PHASE_LABEL.third_place}
          </h3>
          <div style={{ width: CARD_WIDTH, height: CARD_HEIGHT }}>
            <MatchSlot
              slot={{ index: 0, match: thirdPlace[0]! }}
              variant={variant}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function MatchSlot({
  slot,
  variant,
}: {
  slot: Slot;
  variant: "default" | "tv";
}) {
  const isTv = variant === "tv";
  const match = slot.match;
  const isLive = match?.status === "live";
  const isPlaceholder = !match;

  const baseCardClass = "relative flex h-full flex-col justify-between rounded-lg border p-3 shadow-sm";
  const cardClass = isTv
    ? `${baseCardClass} bg-white/5 ${
        isLive
          ? "border-red-400/80 ring-2 ring-red-500/50 animate-pulse-glow"
          : "border-white/15"
      } ${isPlaceholder ? "opacity-50" : ""}`
    : `${baseCardClass} bg-card ${
        isLive ? "border-primary ring-1 ring-primary/30" : "border-border"
      } ${isPlaceholder ? "opacity-50" : ""}`;

  const nameA = match?.playerA?.name ?? slot.placeholderA ?? "—";
  const nameB = match?.playerB?.name ?? slot.placeholderB ?? "—";
  const scoreA = match?.scoreA ?? 0;
  const scoreB = match?.scoreB ?? 0;
  const winnerSide =
    match?.winnerId && match.winnerId === match.playerA?.id
      ? "A"
      : match?.winnerId && match.winnerId === match.playerB?.id
        ? "B"
        : null;

  return (
    <div className={cardClass}>
      <div className="flex flex-col gap-1">
        <SlotLine
          name={nameA}
          score={scoreA}
          winner={winnerSide === "A"}
          isTv={isTv}
          isPlaceholder={isPlaceholder}
        />
        <div className={isTv ? "border-t border-white/10" : "border-t border-border/60"} />
        <SlotLine
          name={nameB}
          score={scoreB}
          winner={winnerSide === "B"}
          isTv={isTv}
          isPlaceholder={isPlaceholder}
        />
      </div>
      <div
        className={`mt-1 flex items-center justify-between text-[10px] uppercase tracking-wider ${isTv ? "text-white/50" : "text-muted-foreground"}`}
      >
        <span>{isPlaceholder ? "Čeká na postup" : statusLabel(match.status)}</span>
        {isLive && (
          <span className="flex items-center gap-1 rounded-full bg-red-500 px-1.5 py-0.5 text-[9px] font-bold tracking-widest text-white">
            <LiveDotInline />
            LIVE
          </span>
        )}
      </div>
    </div>
  );
}

function SlotLine({
  name,
  score,
  winner,
  isTv,
  isPlaceholder,
}: {
  name: string;
  score: number;
  winner: boolean;
  isTv: boolean;
  isPlaceholder: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-2 text-sm ${
        winner ? "font-bold" : ""
      } ${isTv && !winner && !isPlaceholder ? "text-white/80" : ""} ${
        isPlaceholder ? "italic" : ""
      }`}
    >
      <span className="truncate">{name}</span>
      {!isPlaceholder && (
        <span className="ml-2 shrink-0 font-mono tabular-nums">{score}</span>
      )}
    </div>
  );
}

function LiveDotInline() {
  return (
    <span className="relative inline-flex h-1.5 w-1.5 shrink-0">
      <span className="absolute inset-0 animate-ping rounded-full bg-white/80" />
      <span className="relative inline-block h-1.5 w-1.5 rounded-full bg-white" />
    </span>
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

// silence unused-import warning since LiveDot is imported for downstream
// consumers of this file's type re-exports (none currently).
void LiveDot;
