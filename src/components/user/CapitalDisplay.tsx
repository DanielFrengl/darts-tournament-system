import { Badge } from "@/components/ui/badge";

export function CapitalDisplay({ capital }: { capital: string }) {
  const formatted = new Intl.NumberFormat("cs-CZ", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(capital));
  return (
    <Badge variant="secondary" className="font-mono text-base">
      {formatted}
    </Badge>
  );
}
