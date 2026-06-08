"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  changeUserRole,
  deleteUser,
  resetAllStats,
} from "@/app/admin/users/actions";
import type { Role } from "@/lib/roles";
import { CapitalAdjustDialog } from "./CapitalAdjustDialog";

export type AdminUser = {
  id: string;
  username: string;
  displayName: string;
  email: string;
  role: Role;
  capital: string;
};

export function UserList({
  users,
  currentUserId,
  canDebug = false,
}: {
  users: AdminUser[];
  currentUserId: string;
  canDebug?: boolean;
}) {
  const router = useRouter();
  const [adjustingUser, setAdjustingUser] = useState<AdminUser | null>(null);
  const [pending, start] = useTransition();

  async function onToggleRole(user: AdminUser) {
    // Cycle user → admin → user. Debug is set explicitly (debug-only).
    const newRole: Role = user.role === "user" ? "admin" : "user";
    const result = await changeUserRole(user.id, newRole);
    if (result.ok) {
      toast.success("Role změněna");
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  async function onSetRole(user: AdminUser, newRole: Role) {
    const result = await changeUserRole(user.id, newRole);
    if (result.ok) {
      toast.success("Role změněna");
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  function onDeleteUser(user: AdminUser) {
    if (
      !confirm(
        `Opravdu nenávratně smazat uživatele "${user.displayName}"?\nVšechny jeho sázky a transakce budou odstraněny.`
      )
    ) {
      return;
    }
    start(async () => {
      const result = await deleteUser(user.id);
      if (result.ok) {
        toast.success("Uživatel smazán");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  function onResetStats() {
    if (
      !confirm(
        "Opravdu resetovat statistiky VŠECH hráčů?\nVšechny sázky, tikety a transakce budou smazány a kapitál se vrátí na výchozí hodnotu.\nTato akce je nevratná."
      )
    ) {
      return;
    }
    start(async () => {
      const result = await resetAllStats();
      if (result.ok) {
        toast.success("Statistiky resetovány");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  const fmt = new Intl.NumberFormat("cs-CZ", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

  return (
    <>
      {canDebug && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed p-3">
          <div className="flex items-center gap-2">
            <Badge variant="outline">Debug</Badge>
            <span className="text-sm text-muted-foreground">
              Ničivé akce jsou povoleny.
            </span>
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={onResetStats}
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            Resetovat statistiky
          </Button>
        </div>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Jméno</TableHead>
            <TableHead>Username</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Kapitál</TableHead>
            <TableHead>Akce</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((u) => (
            <TableRow key={u.id}>
              <TableCell className="font-medium">{u.displayName}</TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">
                @{u.username}
              </TableCell>
              <TableCell className="text-muted-foreground">{u.email}</TableCell>
              <TableCell>
                <Badge variant={u.role === "user" ? "secondary" : "default"}>{u.role}</Badge>
              </TableCell>
              <TableCell className="font-mono">
                {fmt.format(Number(u.capital))}
                <span className="ml-1 text-xs text-muted-foreground">jablka</span>
              </TableCell>
              <TableCell className="space-x-2">
                <Button size="sm" variant="outline" onClick={() => setAdjustingUser(u)}>
                  Upravit kapitál
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={u.id === currentUserId || pending}
                  onClick={() => onToggleRole(u)}
                >
                  {u.role === "user" ? "Povýšit na admina" : "Snížit na uživatele"}
                </Button>
                {canDebug && u.id !== currentUserId && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() =>
                      onSetRole(u, u.role === "debug" ? "admin" : "debug")
                    }
                  >
                    {u.role === "debug" ? "Odebrat debug" : "Povýšit na debug"}
                  </Button>
                )}
                {canDebug && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={u.id === currentUserId || pending}
                    onClick={() => onDeleteUser(u)}
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  >
                    Smazat
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {adjustingUser && (
        <CapitalAdjustDialog
          user={adjustingUser}
          onClose={() => setAdjustingUser(null)}
          onDone={() => {
            setAdjustingUser(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
