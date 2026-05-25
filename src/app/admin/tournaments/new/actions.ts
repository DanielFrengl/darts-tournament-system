"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { tournamentService } from "@/lib/tournament";
import {
  defaultTournamentConfig,
  TournamentConfigSchema,
  type TournamentConfig,
} from "@/lib/tournament-config";

type CreateInput = {
  name: string;
  config: TournamentConfig;
};

type CreateResult = { ok: true; id: string } | { ok: false; error: string };

export async function createTournament(input: CreateInput): Promise<CreateResult> {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    return { ok: false, error: "Forbidden" };
  }
  const parsed = TournamentConfigSchema.safeParse(input.config);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid config" };
  }
  try {
    const t = await tournamentService.create({ name: input.name, config: parsed.data });
    revalidatePath("/admin/tournaments");
    return { ok: true, id: t.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed" };
  }
}

export async function createTournamentAndRedirect(formData: FormData) {
  const name = String(formData.get("name") ?? "");
  const config = defaultTournamentConfig();
  // Read overrides from the form. Unspecified fields keep defaults.
  const num = (k: string) => {
    const v = formData.get(k);
    return v != null && String(v).length > 0 ? Number(v) : undefined;
  };
  const bool = (k: string) => formData.get(k) === "on";
  const groupCount = num("groupCount") ?? config.groupCount;
  const groupSize = num("groupSize") ?? config.groupSize;
  const advancePerGroup = num("advancePerGroup") ?? config.advancePerGroup;
  const bestOfGroup = num("bestOfGroup") ?? config.bestOfGroup;
  const bestOfQuarter = num("bestOfQuarter") ?? config.bestOfQuarter;
  const bestOfSemi = num("bestOfSemi") ?? config.bestOfSemi;
  const bestOfFinal = num("bestOfFinal") ?? config.bestOfFinal;
  const startingCapital = num("startingCapital") ?? config.startingCapital;

  const result = await createTournament({
    name,
    config: {
      ...config,
      groupCount,
      groupSize,
      advancePerGroup,
      bestOfGroup,
      bestOfQuarter,
      bestOfSemi,
      bestOfFinal,
      thirdPlaceMatch: bool("thirdPlaceMatch"),
      startingCapital,
    },
  });
  if (!result.ok) {
    throw new Error(result.error);
  }
  redirect(`/admin/tournaments/${result.id}/players`);
}
