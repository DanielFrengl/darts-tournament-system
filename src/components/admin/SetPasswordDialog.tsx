"use client";

import { useState, useTransition } from "react";
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
import { setUserPassword } from "@/app/admin/users/actions";
import type { AdminUser } from "./UserList";

export function SetPasswordDialog({
  user,
  onClose,
  onDone,
}: {
  user: AdminUser;
  onClose: () => void;
  onDone: () => void;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, start] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("Heslo musí mít alespoň 8 znaků");
      return;
    }
    if (password !== confirm) {
      toast.error("Hesla se neshodují");
      return;
    }
    start(async () => {
      const result = await setUserPassword(user.id, password);
      if (result.ok) {
        toast.success(`Heslo pro ${user.username} změněno`);
        onDone();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nastavit heslo: {user.username}</DialogTitle>
          <DialogDescription>
            Nastaví nové heslo pro {user.displayName} bez znalosti původního. Použij,
            když uživatel zapomněl heslo.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-password">Nové heslo (min. 8 znaků)</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              maxLength={200}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Heslo znovu</Label>
            <Input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={8}
              maxLength={200}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Zrušit
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Ukládám…" : "Nastavit heslo"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
