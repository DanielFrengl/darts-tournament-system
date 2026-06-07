import Link from "next/link";
import { Button } from "@/components/ui/button";
import { tournamentService } from "@/lib/tournament";
import { buildBracketMatches } from "@/lib/tournament-views";
import { BracketView } from "@/components/tournament/BracketView";
import { PageHeader } from "@/components/layout/PageHeader";

export default async function FullBracketPage() {
  const t = await tournamentService.getActive();
  if (!t) {
    return <p className="text-muted-foreground">Žádný aktivní turnaj.</p>;
  }
  const bracketMatches = await buildBracketMatches(t.id);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${t.name} — Pavouk`}
        actions={
          <Button variant="outline" render={<Link href="/tournament">← Zpět</Link>} />
        }
      />
      <BracketView matches={bracketMatches} />
    </div>
  );
}
