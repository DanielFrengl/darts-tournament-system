"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatJablka } from "@/lib/jablka";
import { cancelBetAction } from "@/app/(app)/moje-sazky/actions";

export function CancelBetButton({
  betId,
  stake,
}: {
  betId: string;
  stake: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  function onConfirm() {
    start(async () => {
      const r = await cancelBetAction(betId);
      if (!r.ok) {
        toast.error(r.error);
        setOpen(false);
        return;
      }
      toast.success("Sázka zrušena", {
        description: `Vráceno ${formatJablka(r.refund)}`,
      });
      setOpen(false);
      router.refresh();
    });
  }

  // The bet row may be wrapped in a <Link>; swallow clicks (including
  // those bubbling back from the dialog portal) so they don't navigate.
  return (
    <span
      className="inline-flex"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <Button
        variant="outline"
        size="sm"
        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        onClick={() => setOpen(true)}
      >
        Zrušit sázku
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Zrušit sázku?</DialogTitle>
            <DialogDescription>
              Vklad {formatJablka(stake)} se ti vrátí na kapitál. Tuto akci
              nelze vzít zpět.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Zpět
            </Button>
            <Button variant="destructive" onClick={onConfirm} disabled={pending}>
              {pending ? "Ruším…" : "Zrušit sázku"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </span>
  );
}
