"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateBio, changePassword } from "./actions";

export function BioForm({ initialBio }: { initialBio: string }) {
  const [bio, setBio] = useState(initialBio);
  const [pending, start] = useTransition();
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    start(async () => {
      const result = await updateBio(bio);
      if (result.ok) toast.success("Bio aktualizováno");
      else toast.error(result.error);
    });
  }
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <Input
        value={bio}
        onChange={(e) => setBio(e.target.value)}
        maxLength={500}
        placeholder="Něco o sobě"
      />
      <Button type="submit" disabled={pending}>
        {pending ? "Ukládám…" : "Uložit"}
      </Button>
    </form>
  );
}

export function PasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [pending, start] = useTransition();
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    start(async () => {
      const result = await changePassword(current, next);
      if (result.ok) {
        toast.success("Heslo změněno");
        setCurrent("");
        setNext("");
      } else {
        toast.error(result.error);
      }
    });
  }
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="current">Současné heslo</Label>
        <Input
          id="current"
          type="password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="new">Nové heslo</Label>
        <Input
          id="new"
          type="password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          required
          minLength={8}
        />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Měním…" : "Změnit heslo"}
      </Button>
    </form>
  );
}
