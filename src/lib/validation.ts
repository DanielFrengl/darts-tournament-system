import { z } from "zod";

const usernameRegex = /^[a-zA-Z0-9_]+$/;

export const RegisterSchema = z.object({
  email: z.email().max(255),
  username: z
    .string()
    .min(3)
    .max(20)
    .regex(usernameRegex, "Username may only contain letters, numbers, and underscores"),
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

export const CapitalAdjustSchema = z.object({
  amount: z.number().refine((n) => n !== 0, { message: "amount must not be zero" }),
  note: z.string().min(1).max(500),
});
export type CapitalAdjustInput = z.infer<typeof CapitalAdjustSchema>;
