import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { RegisterForm } from "@/components/auth/RegisterForm";

export default function RegisterPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Registrace</CardTitle>
        <CardDescription>Vytvoř si účet pro účast v turnajích.</CardDescription>
      </CardHeader>
      <CardContent>
        <RegisterForm />
        <p className="mt-4 text-sm text-muted-foreground">
          Už máš účet?{" "}
          <Link href="/login" className="underline">
            Přihlásit se
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
