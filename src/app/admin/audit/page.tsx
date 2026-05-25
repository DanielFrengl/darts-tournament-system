import { desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db/client";
import { transactions, users } from "@/db/schema";
import { displayName } from "@/lib/names";
import { AuditLogTable, type AuditRow } from "@/components/admin/AuditLogTable";

export default async function AuditLogPage() {
  const adminUsers = alias(users, "admin_users");
  const rows = await db
    .select({
      id: transactions.id,
      createdAt: transactions.createdAt,
      type: transactions.type,
      amount: transactions.amount,
      balanceAfter: transactions.balanceAfter,
      note: transactions.note,
      username: users.username,
      firstName: users.firstName,
      lastName: users.lastName,
      createdByUsername: adminUsers.username,
      createdByFirstName: adminUsers.firstName,
      createdByLastName: adminUsers.lastName,
    })
    .from(transactions)
    .innerJoin(users, eq(users.id, transactions.userId))
    .leftJoin(adminUsers, eq(adminUsers.id, transactions.createdBy))
    .orderBy(desc(transactions.createdAt))
    .limit(200);

  const mapped: AuditRow[] = rows.map((r) => ({
    id: r.id,
    createdAt: r.createdAt,
    username: displayName({
      username: r.username,
      firstName: r.firstName,
      lastName: r.lastName,
    }),
    type: r.type,
    amount: r.amount,
    balanceAfter: r.balanceAfter,
    note: r.note,
    createdByUsername: r.createdByUsername
      ? displayName({
          username: r.createdByUsername,
          firstName: r.createdByFirstName,
          lastName: r.createdByLastName,
        })
      : null,
  }));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Audit log</h1>
      <p className="text-sm text-muted-foreground">Posledních 200 transakcí.</p>
      <AuditLogTable rows={mapped} />
    </div>
  );
}
