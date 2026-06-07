import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { AppShell } from "@/components/layout/AppShell";
import { displayName } from "@/lib/names";
import { getAppSettings } from "@/lib/settings";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "admin") redirect("/");

  const [me] = await db
    .select({
      username: users.username,
      firstName: users.firstName,
      lastName: users.lastName,
      avatarUrl: users.avatarUrl,
      capital: users.capital,
      role: users.role,
    })
    .from(users)
    .where(eq(users.id, session.user.id));
  if (!me) redirect("/login");
  const settings = await getAppSettings();

  return (
    <AppShell
      user={{
        id: session.user.id,
        username: me.username,
        displayName: displayName(me),
        avatarUrl: me.avatarUrl,
        capital: me.capital,
        role: me.role,
      }}
      systemName={settings.name}
      logoUrl={settings.logoUrl}
    >
      {children}
    </AppShell>
  );
}
