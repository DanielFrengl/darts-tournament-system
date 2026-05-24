import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-4xl font-bold">Darts Tournament</h1>
      <p className="text-muted-foreground">Lokální turnaj s virtuálními sázkami.</p>
      <div className="flex gap-4">
        <Button render={<Link href="/login">Přihlásit se</Link>} />
        <Button variant="secondary" render={<Link href="/register">Registrovat se</Link>} />
      </div>
    </main>
  );
}
