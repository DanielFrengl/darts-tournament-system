import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

type Props = {
  username: string;
  avatarUrl: string | null;
  bio: string | null;
  capital: string;
  role: "user" | "admin";
};

export function ProfileCard({ username, avatarUrl, bio, capital, role }: Props) {
  const formattedCapital = new Intl.NumberFormat("cs-CZ", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(capital));
  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-4 space-y-0">
        <Avatar className="h-16 w-16">
          {avatarUrl && <AvatarImage src={avatarUrl} alt={username} />}
          <AvatarFallback>{username.slice(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div>
          <h2 className="text-xl font-semibold">{username}</h2>
          {role === "admin" && <Badge variant="outline">admin</Badge>}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {bio && <p className="text-sm text-muted-foreground">{bio}</p>}
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Kapitál:</span>
          <span className="font-mono">{formattedCapital}</span>
        </div>
      </CardContent>
    </Card>
  );
}
