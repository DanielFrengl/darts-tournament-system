import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { isAdmin, type Role } from "@/lib/roles";
import { jablkaWord } from "@/lib/jablka";

type Props = {
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  capital: string;
  role: Role;
};

export function ProfileCard({
  username,
  displayName,
  avatarUrl,
  bio,
  capital,
  role,
}: Props) {
  const formattedCapital = new Intl.NumberFormat("cs-CZ", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(capital));
  const initials =
    displayName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]!.toUpperCase())
      .join("") || username.slice(0, 2).toUpperCase();
  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-4 space-y-0">
        <Avatar className="h-16 w-16">
          {avatarUrl && <AvatarImage src={avatarUrl} alt={displayName} />}
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        <div className="space-y-1">
          <h2 className="text-xl font-semibold">{displayName}</h2>
          <p className="text-xs font-mono text-muted-foreground">@{username}</p>
          {isAdmin(role) && <Badge variant="outline">{role}</Badge>}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {bio && <p className="text-sm text-muted-foreground">{bio}</p>}
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Kapitál:</span>
          <span className="font-mono font-semibold">{formattedCapital}</span>
          <span className="text-xs uppercase tracking-wider text-muted-foreground">
            {jablkaWord(Number(capital))}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
