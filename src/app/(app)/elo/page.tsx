import { desc } from "drizzle-orm";
import { db } from "@/db/client";
import { competitors } from "@/db/schema";
import { PageHeader } from "@/components/layout/PageHeader";

export const metadata = {
  title: "Elo hráčů",
};

export default async function EloPage() {
  const rows = await db
    .select({
      name: competitors.displayName,
      elo: competitors.eloRating,
    })
    .from(competitors)
    .orderBy(desc(competitors.eloRating));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Elo hráčů"
        description="Síla hráčů spočítaná z výsledků předešlých turnajů. 1500 = průměr / start nováčka."
      />
      <p className="text-xs text-muted-foreground">
        Disclaimer: o elu nestranně rozhodl vypočítávací algoritmus a pak to
        přehodnotila AI na bázi kontextu dat.
      </p>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Zatím tu nejsou žádní hráči – ratingy se objeví po importu historie.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 w-12">#</th>
                <th className="px-4 py-3">Hráč</th>
                <th className="px-4 py-3 text-right">Elo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r, i) => (
                <tr key={r.name} className={i < 3 ? "bg-amber-500/5" : undefined}>
                  <td className="px-4 py-2.5 tabular-nums text-muted-foreground">
                    {i + 1}.
                  </td>
                  <td className="px-4 py-2.5 font-medium">{r.name}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {r.elo}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
