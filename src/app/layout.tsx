import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SessionProvider } from "next-auth/react";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/layout/ThemeProvider";
import { auth } from "@/lib/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: "Darts Tournament",
  description: "Local darts tournament with virtual betting",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  return (
    <html lang="cs" suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
          <SessionProvider session={session}>{children}</SessionProvider>
          <Toaster richColors position="top-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
