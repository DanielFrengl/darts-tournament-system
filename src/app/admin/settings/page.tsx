import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAppSettings } from "@/lib/settings";
import { SystemSettingsForm } from "@/components/admin/SystemSettingsForm";

export default async function AdminSettingsPage() {
  const settings = await getAppSettings();
  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">Nastavení systému</h1>
      <Card>
        <CardHeader>
          <CardTitle>Identita</CardTitle>
        </CardHeader>
        <CardContent>
          <SystemSettingsForm
            initialName={settings.name}
            initialLogoUrl={settings.logoUrl}
            initialInviteCode={settings.inviteCode}
          />
        </CardContent>
      </Card>
    </div>
  );
}
