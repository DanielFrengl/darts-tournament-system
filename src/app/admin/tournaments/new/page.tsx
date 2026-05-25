import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { createTournamentAndRedirect } from "./actions";

export default function NewTournamentPage() {
  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <Button
          variant="ghost"
          size="sm"
          render={
            <Link href="/admin/tournaments">
              <ArrowLeft className="mr-1 h-4 w-4" /> Zpět na turnaje
            </Link>
          }
        />
      </div>
      <div>
        <h1 className="text-2xl font-semibold">Nový turnaj</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Krok 1 z 3 — Konfigurace · 2. Hráči · 3. Spustit
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Konfigurace</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createTournamentAndRedirect} className="space-y-4">
            <Field name="name" label="Název" required type="text" />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field name="groupCount" label="Počet skupin" defaultValue="2" type="number" min={1} max={8} />
              <Field name="groupSize" label="Hráčů ve skupině" defaultValue="4" type="number" min={2} max={16} />
              <Field name="advancePerGroup" label="Postupují ze skupiny" defaultValue="2" type="number" min={1} max={16} />
              <Field name="startingCapital" label="Startovní kapitál" defaultValue="1000" type="number" min={0} />
            </div>
            <fieldset className="space-y-3 rounded border p-3">
              <legend className="px-2 text-sm font-medium">Best of (liché)</legend>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Field name="bestOfGroup" label="Skupina" defaultValue="3" type="number" />
                <Field name="bestOfQuarter" label="Čtvrtfin." defaultValue="5" type="number" />
                <Field name="bestOfSemi" label="Semifin." defaultValue="5" type="number" />
                <Field name="bestOfFinal" label="Finále" defaultValue="7" type="number" />
              </div>
            </fieldset>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="thirdPlaceMatch" /> Zápas o 3. místo
            </label>
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                render={
                  <Link href="/admin/tournaments">
                    <ArrowLeft className="mr-1 h-4 w-4" /> Zpět
                  </Link>
                }
              />
              <Button type="submit">Vytvořit a pokračovat na hráče →</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({
  name,
  label,
  defaultValue,
  type,
  required,
  min,
  max,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  type: "text" | "number";
  required?: boolean;
  min?: number;
  max?: number;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        name={name}
        type={type}
        defaultValue={defaultValue}
        required={required}
        min={min}
        max={max}
      />
    </div>
  );
}
