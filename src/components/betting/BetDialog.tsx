"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { placeBetAction } from "@/app/(app)/match/[id]/actions";
import { formatJablka } from "@/lib/jablka";
import { isWholeStake } from "@/lib/validation";

export type BetTarget = {
  selectionId: string;
  marketLabel: string;
  selectionLabel: string;
  finalOdds: number;
};

export function BetDialog({
  matchId,
  target,
  capital,
  maxBet,
  onClose,
}: {
  matchId: string;
  target: BetTarget | null;
  capital: number;
  /** App-wide max stake per bet, or null when no limit is set. */
  maxBet: number | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [stake, setStake] = useState("");
  const [pending, start] = useTransition();
  if (!target) return null;

  const numericStake = Number(stake);
  // Whole jablka only. `notWhole` is tracked separately so a typed decimal
  // gets its own message instead of silently disabling the button.
  const validStake = isWholeStake(numericStake);
  const notWhole =
    stake.trim() !== "" &&
    Number.isFinite(numericStake) &&
    numericStake > 0 &&
    !Number.isInteger(numericStake);
  const maxStake = maxBet != null ? Math.min(capital, maxBet) : capital;
  const potentialPayout = validStake ? numericStake * target.finalOdds : 0;
  // overMax = over the absolute max-bet limit; overBalance = over capital.
  // Kept separate so a pure capital shortfall doesn't also trip the limit
  // error (capital takes priority in the UI below).
  const overBalance = validStake && numericStake > capital;
  const overMax = maxBet != null && validStake && numericStake > maxBet;

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!validStake || overMax || overBalance) {
      toast.error("Neplatná částka");
      return;
    }
    start(async () => {
      const r = await placeBetAction(target!.selectionId, numericStake, matchId);
      if (r.ok) {
        toast.success(
          `Sázka přijata. Možná výhra ${formatJablka(r.payout)}`
        );
        onClose();
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Vsadit: {target.selectionLabel}</DialogTitle>
          <DialogDescription>
            {target.marketLabel} · kurz {target.finalOdds.toFixed(2)}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="stake">Vklad</Label>
            <Input
              id="stake"
              type="number"
              inputMode="numeric"
              step="1"
              min="1"
              max={maxStake}
              value={stake}
              // Keep what was typed rather than stripping the separator:
              // rewriting "1.5" to "15" would silently stake 10x more.
              onChange={(e) => setStake(e.target.value)}
              required
            />
            <p className="text-xs text-muted-foreground">
              Kapitál: {formatJablka(capital)}
              {maxBet != null && <> · max sázka: {formatJablka(maxBet)}</>}
            </p>
          </div>
          {validStake && (
            <div className="rounded border bg-muted p-3 text-sm">
              Možná výhra:{" "}
              <span className="font-mono font-bold">{formatJablka(potentialPayout)}</span>
            </div>
          )}
          {overBalance ? (
            <p className="text-sm text-destructive">Nedostatek kapitálu.</p>
          ) : overMax ? (
            <p className="text-sm text-destructive">Překračuje max sázku.</p>
          ) : notWhole ? (
            <p className="text-sm text-destructive">
              Vklad musí být celé číslo.
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Zrušit
            </Button>
            <Button type="submit" disabled={pending || !validStake || overMax || overBalance}>
              {pending ? "Odesílám…" : "Vsadit"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
