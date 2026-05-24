import { hash, verify, Algorithm } from "@node-rs/argon2";

const OPTS = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

export async function hashPassword(plain: string): Promise<string> {
  if (!plain || plain.length === 0) {
    throw new Error("password must not be empty");
  }
  return hash(plain, OPTS);
}

export async function verifyPassword(plain: string, hashed: string): Promise<boolean> {
  try {
    return await verify(hashed, plain);
  } catch {
    return false;
  }
}
