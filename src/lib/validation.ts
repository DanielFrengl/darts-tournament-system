import { z } from "zod";

const nameRegex = /^[\p{L}][\p{L}\p{M}'\- ]{0,58}[\p{L}]$|^[\p{L}]$/u;

export const RegisterSchema = z.object({
  email: z.email().max(255),
  firstName: z
    .string()
    .trim()
    .min(1, "Jméno je povinné")
    .max(60)
    .regex(nameRegex, "Neplatné jméno"),
  lastName: z
    .string()
    .trim()
    .min(1, "Příjmení je povinné")
    .max(60)
    .regex(nameRegex, "Neplatné příjmení"),
  password: z.string().min(8).max(200),
});
export type RegisterInput = z.infer<typeof RegisterSchema>;

export const LoginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof LoginSchema>;

export const ProfileUpdateSchema = z
  .object({
    bio: z.string().max(500).optional(),
    currentPassword: z.string().min(1).optional(),
    newPassword: z.string().min(8).max(200).optional(),
  })
  .refine(
    (v) => {
      if (v.newPassword && !v.currentPassword) return false;
      if (v.currentPassword && !v.newPassword) return false;
      return true;
    },
    { message: "Both currentPassword and newPassword required to change password" }
  );
export type ProfileUpdateInput = z.infer<typeof ProfileUpdateSchema>;

export const AdminPasswordSetSchema = z.object({
  newPassword: z.string().min(8, "Heslo musí mít alespoň 8 znaků").max(200),
});
export type AdminPasswordSetInput = z.infer<typeof AdminPasswordSetSchema>;

/**
 * Stakes are whole jablka only. Decimal vklady made payouts and capital
 * awkward to read and served no purpose in a friends' tournament.
 */
export const StakeSchema = z
  .number()
  .int("Vklad musí být celé číslo")
  .positive("Vklad musí být kladný");

/** True when `n` is a usable whole-number stake. Shared by UI and server. */
export function isWholeStake(n: number): boolean {
  return Number.isInteger(n) && n > 0;
}

export const CapitalAdjustSchema = z.object({
  amount: z.number().refine((n) => n !== 0, { message: "amount must not be zero" }),
  note: z.string().min(1).max(500),
});
export type CapitalAdjustInput = z.infer<typeof CapitalAdjustSchema>;
