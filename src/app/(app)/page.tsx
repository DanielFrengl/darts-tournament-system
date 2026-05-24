import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function DashboardPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <Card>
        <CardHeader>
          <CardTitle>Vítej</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Aktivní turnaj zatím není. Až ho admin založí, objeví se zde přehled zápasů a sázek.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
