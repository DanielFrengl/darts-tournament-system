import Link from "next/link";
import { Button } from "@/components/ui/button";
import { tournamentService } from "@/lib/tournament";
import { buildBracketMatches } from "@/lib/tournament-views";
import { BracketView } from "@/components/tournament/BracketView";

export default async function FullBracketPage() {
  const t = await tournamentService.getActive();
  if (!t) {
    return <p className="text-muted-foreground">Žádný aktivní turnaj.</p>;
  }
  const bracketMatches = await buildBracketMatches(t.id);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t.name} — Pavouk</h1>
        <Button variant="outline" render={<Link href="/tournament">← Zpět</Link>} />
      </div>
      <BracketView matches={bracketMatches} />
    </div>
  );
}
