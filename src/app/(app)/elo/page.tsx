import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { competitors, users } from "@/db/schema";
import { displayName } from "@/lib/names";
import { PageHeader } from "@/components/layout/PageHeader";
import { EloChart } from "@/components/elo/EloChart";

export const metadata = {
  title: "Elo hráčů",
};

export default async function EloPage() {
  const raw = await db
    .select({
      firstName: users.firstName,
      lastName: users.lastName,
      username: users.username,
      elo: competitors.eloRating,
    })
    .from(competitors)
    .innerJoin(users, eq(competitors.userId, users.id))
    .orderBy(desc(competitors.eloRating));

  const rows = raw.map((u) => ({
    name: displayName(u),
    username: u.username,
    elo: u.elo,
  }));

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
          Zatím tu nejsou žádní spárovaní hráči – Elo se zobrazí, jakmile
          přiřadíš účty hráčům v adminu.
        </p>
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="w-12 px-4 py-3">#</th>
                  <th className="px-4 py-3">Hráč</th>
                  <th className="px-4 py-3 text-right">Elo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r, i) => (
                  <tr key={r.username}>
                    <td className="px-4 py-2.5 tabular-nums text-muted-foreground">
                      {i + 1}.
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="font-medium">{r.name}</span>{" "}
                      <span className="text-muted-foreground">
                        @{r.username}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {r.elo}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <EloChart rows={rows} />
        </>
      )}
    </div>
  );
}
