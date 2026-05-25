"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UploadButton } from "@/lib/uploadthing";
import { updateSystemName, updateSystemLogo } from "@/app/admin/settings/actions";

export function SystemSettingsForm({
  initialName,
  initialLogoUrl,
}: {
  initialName: string;
  initialLogoUrl: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [logoUrl, setLogoUrl] = useState(initialLogoUrl);
  const [pendingName, startName] = useTransition();

  function saveName(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Jméno nesmí být prázdné");
      return;
    }
    startName(async () => {
      const r = await updateSystemName(name.trim());
      if (r.ok) {
        toast.success("Uloženo");
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <div className="space-y-6">
      <form onSubmit={saveName} className="space-y-3">
        <Label htmlFor="name">Název systému</Label>
        <div className="flex gap-2">
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            required
            className="flex-1"
          />
          <Button type="submit" disabled={pendingName || name === initialName}>
            {pendingName ? "Ukládám…" : "Uložit"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Zobrazuje se v hlavičce, v sidebaru, na TV display, v záložce prohlížeče.
        </p>
      </form>

      <div className="space-y-3">
        <Label>Logo</Label>
        <div className="flex items-center gap-6">
          <div className="relative flex h-24 w-24 items-center justify-center overflow-hidden rounded-lg border bg-muted/30">
            {/* Image domain may not be configured for arbitrary UploadThing
                hosts, so we use a plain <img>. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={logoUrl}
              alt="Logo systému"
              className="max-h-full max-w-full object-contain"
            />
          </div>
          <div className="space-y-2">
            <UploadButton
              endpoint="logo"
              onClientUploadComplete={async (res) => {
                const uploaded = res[0];
                if (!uploaded) return;
                const result = await updateSystemLogo(uploaded.ufsUrl);
                if (result.ok) {
                  setLogoUrl(uploaded.ufsUrl);
                  toast.success("Logo aktualizováno");
                  router.refresh();
                } else {
                  toast.error(result.error);
                }
              }}
              onUploadError={(err) => {
                toast.error(err.message);
              }}
            />
            <p className="text-xs text-muted-foreground">
              JPG, PNG nebo WebP — max 4 MB. Doporučeně čtvercové, alespoň 256 px.
            </p>
          </div>
        </div>
      </div>
      <noscript>{void Image}</noscript>
    </div>
  );
}
