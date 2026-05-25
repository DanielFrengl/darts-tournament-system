import type { ReactNode } from "react";
import { getAppSettings } from "@/lib/settings";

export default async function AuthLayout({ children }: { children: ReactNode }) {
  const settings = await getAppSettings();
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-4">
      <div className="flex flex-col items-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={settings.logoUrl}
          alt={settings.name}
          className="h-20 w-20 object-contain"
        />
        <p className="text-lg font-semibold">{settings.name}</p>
      </div>
      <div className="w-full max-w-md">{children}</div>
    </main>
  );
}
