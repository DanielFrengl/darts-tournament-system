import Link from "next/link";
import { Suspense } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LoginForm } from "@/components/auth/LoginForm";

export default function LoginPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Přihlášení</CardTitle>
        <CardDescription>Zadej email a heslo.</CardDescription>
      </CardHeader>
      <CardContent>
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
        <p className="mt-4 text-sm text-muted-foreground">
          Nemáš účet?{" "}
          <Link href="/register" className="underline">
            Registrovat se
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
