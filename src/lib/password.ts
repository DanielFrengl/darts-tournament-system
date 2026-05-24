import { hash, verify } from "@node-rs/argon2";

// Algorithm is an ambient const enum in @node-rs/argon2's .d.ts which
// TS's isolatedModules forbids referencing. The wire value is stable
// (Argon2id = 2) — see node_modules/@node-rs/argon2/index.d.ts.
const ARGON2ID = 2 as const;

const OPTS = {
  algorithm: ARGON2ID,
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
