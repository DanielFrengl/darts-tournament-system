import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import Link from "next/link";
import { auth } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "admin") redirect("/");

  return (
    <div className="flex min-h-screen">
      <aside className="w-56 space-y-1 border-r p-4">
        <h2 className="mb-4 text-lg font-bold">Admin</h2>
        <Link href="/admin" className="block rounded px-2 py-1.5 text-sm hover:bg-accent">
          Dashboard
        </Link>
        <Link href="/admin/users" className="block rounded px-2 py-1.5 text-sm hover:bg-accent">
          Uživatelé
        </Link>
        <Link href="/admin/audit" className="block rounded px-2 py-1.5 text-sm hover:bg-accent">
          Audit log
        </Link>
        <div className="my-3 border-t" />
        <Link href="/" className="block rounded px-2 py-1.5 text-sm hover:bg-accent">
          ← Zpět do aplikace
        </Link>
      </aside>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
