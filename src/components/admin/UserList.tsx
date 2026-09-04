"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  changeUserRole,
  deleteUser,
  resetAllStats,
} from "@/app/admin/users/actions";
import type { Role } from "@/lib/roles";
import { jablkaWord } from "@/lib/jablka";
import { UserLink } from "@/components/user/UserLink";
import { CapitalAdjustDialog } from "./CapitalAdjustDialog";
import { SetPasswordDialog } from "./SetPasswordDialog";

export type AdminUser = {
  id: string;
  username: string;
  displayName: string;
  email: string;
  role: Role;
  capital: string;
};

const ROLE_LABEL: Record<string, string> = {
  user: "Hráč",
  admin: "Admin",
  debug: "Debug",
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
  const [passwordUser, setPasswordUser] = useState<AdminUser | null>(null);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<Role | null>(null);
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

  const roles = [...new Set(users.map((u) => u.role))].sort();

  const q = query.trim().toLowerCase();
  const filtered = users.filter(
    (u) =>
      (!roleFilter || u.role === roleFilter) &&
      (!q ||
        u.displayName.toLowerCase().includes(q) ||
        u.username.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q))
  );

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

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Hledat jméno, username nebo e-mail…"
          aria-label="Hledat uživatele"
          className="h-8 w-full sm:w-72"
        />
        {roles.length > 1 && (
          <div className="flex flex-wrap items-center gap-1">
            <Button
              size="sm"
              variant={roleFilter === null ? "secondary" : "ghost"}
              onClick={() => setRoleFilter(null)}
            >
              Vše
            </Button>
            {roles.map((r) => (
              <Button
                key={r}
                size="sm"
                variant={roleFilter === r ? "secondary" : "ghost"}
                onClick={() => setRoleFilter(roleFilter === r ? null : r)}
              >
                {ROLE_LABEL[r] ?? r}
              </Button>
            ))}
          </div>
        )}
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          {filtered.length === users.length
            ? `${users.length} uživatelů`
            : `${filtered.length} z ${users.length}`}
        </span>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Jméno</TableHead>
            <TableHead>Username</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead className="text-right">Kapitál</TableHead>
            <TableHead className="text-right">Akce</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((u) => {
            const isSelf = u.id === currentUserId;
            return (
              <TableRow key={u.id}>
                <TableCell className="font-medium">
                  <UserLink username={u.username}>{u.displayName}</UserLink>
                  {isSelf && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      (ty)
                    </span>
                  )}
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  <UserLink username={u.username}>@{u.username}</UserLink>
                </TableCell>
                <TableCell className="text-muted-foreground">{u.email}</TableCell>
                <TableCell>
                  <Badge variant={u.role === "user" ? "secondary" : "default"}>
                    {ROLE_LABEL[u.role] ?? u.role}
                  </Badge>
                </TableCell>
                <TableCell className="text-right font-mono">
                  {fmt.format(Number(u.capital))}
                  <span className="ml-1 text-xs text-muted-foreground">
                    {jablkaWord(Number(u.capital))}
                  </span>
                </TableCell>
                {/* One primary action inline; the rest — including everything
                    destructive — behind a menu, so the row stays readable. */}
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setAdjustingUser(u)}
                    >
                      Upravit kapitál
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        aria-label={`Další akce pro ${u.displayName}`}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56">
                        <DropdownMenuItem
                          disabled={isSelf || pending}
                          onClick={() => onToggleRole(u)}
                        >
                          {u.role === "user"
                            ? "Povýšit na admina"
                            : "Snížit na uživatele"}
                        </DropdownMenuItem>
                        {canDebug && !isSelf && (
                          <DropdownMenuItem
                            disabled={pending}
                            onClick={() =>
                              onSetRole(u, u.role === "debug" ? "admin" : "debug")
                            }
                          >
                            {u.role === "debug"
                              ? "Odebrat debug"
                              : "Povýšit na debug"}
                          </DropdownMenuItem>
                        )}
                        {canDebug && (
                          <DropdownMenuItem
                            disabled={pending}
                            onClick={() => setPasswordUser(u)}
                          >
                            Změnit heslo
                          </DropdownMenuItem>
                        )}
                        {canDebug && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              variant="destructive"
                              disabled={isSelf || pending}
                              onClick={() => onDeleteUser(u)}
                            >
                              Smazat uživatele
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
          {filtered.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                Žádný uživatel neodpovídá filtru.
              </TableCell>
            </TableRow>
          )}
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
      {passwordUser && (
        <SetPasswordDialog
          user={passwordUser}
          onClose={() => setPasswordUser(null)}
          onDone={() => {
            setPasswordUser(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
