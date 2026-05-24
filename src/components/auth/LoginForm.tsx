"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(formData: FormData) {
    setError(null);
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");
    start(async () => {
      const result = await signIn("credentials", { email, password, redirect: false });
      if (!result || result.error) {
        setError("Neplatné přihlašovací údaje");
        return;
      }
      toast.success("Přihlášeno");
      router.push(params.get("from") ?? "/");
      router.refresh();
    });
  }

  return (
    <form action={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required autoComplete="email" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Heslo</Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Přihlašuji…" : "Přihlásit"}
      </Button>
    </form>
  );
}
