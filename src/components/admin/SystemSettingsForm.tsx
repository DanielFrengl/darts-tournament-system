"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UploadButton } from "@/lib/uploadthing";
import {
  updateSystemName,
  updateSystemLogo,
  updateInviteCode,
  regenerateInviteCode,
  updateMaxBet,
} from "@/app/admin/settings/actions";

export function SystemSettingsForm({
  initialName,
  initialLogoUrl,
  initialInviteCode,
  initialMaxBet,
}: {
  initialName: string;
  initialLogoUrl: string;
  initialInviteCode: string;
  initialMaxBet: string | null;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [logoUrl, setLogoUrl] = useState(initialLogoUrl);
  const [inviteCode, setInviteCode] = useState(initialInviteCode);
  const [limitEnabled, setLimitEnabled] = useState(initialMaxBet !== null);
  const [maxBet, setMaxBet] = useState(
    initialMaxBet !== null ? String(Number(initialMaxBet)) : ""
  );
  const [pendingName, startName] = useTransition();
  const [pendingInvite, startInvite] = useTransition();
  const [pendingMaxBet, startMaxBet] = useTransition();

  function saveMaxBet(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    let value: number | null = null;
    if (limitEnabled) {
      value = Number(maxBet);
      if (!Number.isFinite(value) || value <= 0) {
        toast.error("Zadej kladné číslo");
        return;
      }
    }
    startMaxBet(async () => {
      const r = await updateMaxBet(value);
      if (r.ok) {
        toast.success(
          value === null ? "Limit sázky vypnut" : `Limit sázky nastaven na ${value}`
        );
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

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

  function saveInvite(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (inviteCode.trim().length < 3) {
      toast.error("Minimálně 3 znaky");
      return;
    }
    startInvite(async () => {
      const r = await updateInviteCode(inviteCode.trim());
      if (r.ok) {
        toast.success("Zvací kód uložen");
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  function regenerate() {
    startInvite(async () => {
      const r = await regenerateInviteCode();
      if (r.ok && r.code) {
        setInviteCode(r.code);
        toast.success(`Nový kód: ${r.code}`);
        router.refresh();
      } else if (!r.ok) {
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
              appearance={{
                button:
                  "bg-primary text-primary-foreground rounded-md px-4 text-sm font-medium",
                allowedContent: "text-muted-foreground",
              }}
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

      <form onSubmit={saveInvite} className="space-y-3">
        <Label htmlFor="invite">Zvací kód</Label>
        <div className="flex gap-2">
          <Input
            id="invite"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
            maxLength={64}
            required
            className="flex-1 font-mono"
          />
          <Button
            type="submit"
            disabled={pendingInvite || inviteCode === initialInviteCode}
          >
            {pendingInvite ? "Ukládám…" : "Uložit"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={pendingInvite}
            onClick={regenerate}
          >
            Vygenerovat
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Bez tohoto kódu se nikdo nedostane na přihlášení ani registraci.
          Změna kódu nevypne existující uživatele.
        </p>
      </form>

      <form onSubmit={saveMaxBet} className="space-y-3 border-t pt-6">
        <Label htmlFor="max-bet">Maximální sázka</Label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={limitEnabled}
            onChange={(e) => setLimitEnabled(e.target.checked)}
            className="h-4 w-4 accent-primary"
          />
          Omezit maximální výši jedné sázky / tiketu
        </label>
        <div className="flex gap-2">
          <Input
            id="max-bet"
            type="number"
            min={1}
            step="0.01"
            value={maxBet}
            onChange={(e) => setMaxBet(e.target.value)}
            disabled={!limitEnabled}
            placeholder={limitEnabled ? "např. 500" : "Bez limitu"}
            className="flex-1"
          />
          <Button type="submit" disabled={pendingMaxBet}>
            {pendingMaxBet ? "Ukládám…" : "Uložit"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Absolutní horní hranice vkladu na jednu sázku i tiket (v jablkách). Když
          je vypnutá, platí jen procentní limit z kapitálu nastavený u turnaje.
        </p>
      </form>

      <noscript>{void Image}</noscript>
    </div>
  );
}
