"use client";

import { useState } from "react";
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
import { changeUserRole } from "@/app/admin/users/actions";
import { CapitalAdjustDialog } from "./CapitalAdjustDialog";

export type AdminUser = {
  id: string;
  username: string;
  email: string;
  role: "user" | "admin";
  capital: string;
};

export function UserList({
  users,
  currentUserId,
}: {
  users: AdminUser[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [adjustingUser, setAdjustingUser] = useState<AdminUser | null>(null);

  async function onToggleRole(user: AdminUser) {
    const newRole = user.role === "admin" ? "user" : "admin";
    const result = await changeUserRole(user.id, newRole);
    if (result.ok) {
      toast.success("Role změněna");
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  const fmt = new Intl.NumberFormat("cs-CZ", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
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
              <TableCell className="font-medium">{u.username}</TableCell>
              <TableCell className="text-muted-foreground">{u.email}</TableCell>
              <TableCell>
                <Badge variant={u.role === "admin" ? "default" : "secondary"}>{u.role}</Badge>
              </TableCell>
              <TableCell className="font-mono">{fmt.format(Number(u.capital))}</TableCell>
              <TableCell className="space-x-2">
                <Button size="sm" variant="outline" onClick={() => setAdjustingUser(u)}>
                  Upravit kapitál
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={u.id === currentUserId}
                  onClick={() => onToggleRole(u)}
                >
                  {u.role === "admin" ? "Demote" : "Promote"}
                </Button>
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
