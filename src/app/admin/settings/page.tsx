import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAppSettings } from "@/lib/settings";
import { SystemSettingsForm } from "@/components/admin/SystemSettingsForm";
import { PageHeader } from "@/components/layout/PageHeader";

export default async function AdminSettingsPage() {
  const settings = await getAppSettings();
  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader title="Nastavení systému" />
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
