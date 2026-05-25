"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { toast } from "sonner";
import { registerUser } from "@/app/(auth)/register/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function RegisterForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(formData: FormData) {
    setError(null);
    const input = {
      email: String(formData.get("email") ?? ""),
      username: String(formData.get("username") ?? ""),
      password: String(formData.get("password") ?? ""),
      inviteCode: String(formData.get("inviteCode") ?? ""),
    };
    start(async () => {
      const result = await registerUser(input);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const signInResult = await signIn("credentials", {
        email: input.email,
        password: input.password,
        redirect: false,
      });
      if (signInResult?.error) {
        setError("Registered, but auto-login failed. Please log in.");
        router.push("/login");
        return;
      }
      toast.success("Účet vytvořen");
      router.push("/");
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
        <Label htmlFor="username">Username</Label>
        <Input
          id="username"
          name="username"
          required
          autoComplete="username"
          minLength={3}
          maxLength={20}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Heslo</Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="new-password"
          minLength={8}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="inviteCode">Zvací kód</Label>
        <Input
          id="inviteCode"
          name="inviteCode"
          required
          autoComplete="off"
          placeholder="kód od pořadatele"
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Vytváří se…" : "Registrovat"}
      </Button>
    </form>
  );
}
