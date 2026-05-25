import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { getAppSettings } from "@/lib/settings";
import { submitInvite } from "./actions";

export const dynamic = "force-dynamic";

export default async function InvitePage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string; error?: string }>;
}) {
  const params = await searchParams;
  const settings = await getAppSettings();
  const redirectTo = params.redirectTo ?? "/login";
  const errorLabel =
    params.error === "invalid"
      ? "Neplatný kód."
      : params.error === "missing"
        ? "Zadej kód."
        : null;

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
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Zvací kód</CardTitle>
          <CardDescription>
            Tato akce je jen pro pozvané. Zadej kód, který jsi dostal od pořadatele.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={submitInvite} className="space-y-4">
            <input type="hidden" name="redirectTo" value={redirectTo} />
            <div className="space-y-2">
              <Label htmlFor="code">Kód</Label>
              <Input
                id="code"
                name="code"
                required
                autoFocus
                autoComplete="off"
                placeholder="např. darts"
              />
            </div>
            {errorLabel && <p className="text-sm text-destructive">{errorLabel}</p>}
            <Button type="submit" className="w-full">
              Pokračovat
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
