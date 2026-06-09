import Link from "next/link";
import { Target, Coins, Trophy, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatJablka } from "@/lib/jablka";

/**
 * First-run explainer shown on the dashboard until a player places their
 * first bet. Demystifies the virtual currency and the bet → win → climb loop
 * for users with no betting background.
 */
export function HowItWorks({ startingCapital }: { startingCapital: number }) {
  const steps = [
    {
      icon: Coins,
      title: `Máš ${formatJablka(startingCapital)}`,
      body: "Virtuální měna jen pro zábavu — hraje se o první místo v žebříčku, ne o peníze.",
    },
    {
      icon: Target,
      title: "Vsaď na svůj tip",
      body: "V sekci Sázení klikni na hráče, kterého tipuješ na výhru, a zadej vklad.",
    },
    {
      icon: Trophy,
      title: "Vyhraj a stoupej",
      body: "Trefený tip ti vklad znásobí kurzem. Čím víc jablek, tím výš v žebříčku.",
    },
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Jak to funguje</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <ol className="grid gap-4 sm:grid-cols-3">
          {steps.map((s, i) => (
            <li key={i} className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full border bg-muted/40 text-muted-foreground">
                  <s.icon className="h-4 w-4" aria-hidden />
                </span>
                <span className="text-sm font-semibold">{s.title}</span>
              </div>
              <p className="text-sm text-muted-foreground">{s.body}</p>
            </li>
          ))}
        </ol>
        <Button render={<Link href="/sazeni">Začít sázet <ArrowRight className="h-4 w-4" /></Link>} />
      </CardContent>
    </Card>
  );
}
