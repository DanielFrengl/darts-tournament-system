/**
 * Role model for the app.
 *
 * "debug" is a strict superset of "admin": a debug user can do everything an
 * admin can, plus destructive operations (delete users, delete tournaments in
 * any phase, reset all stats). Every admin gate therefore treats "debug" as
 * an admin, while destructive paths are guarded by `isDebug`.
 */
export type Role = "user" | "admin" | "debug";

/** True for users who may access the admin area and admin actions. */
export function isAdmin(role: Role | undefined | null): boolean {
  return role === "admin" || role === "debug";
}

/** True only for debug (super-admin) users with destructive powers. */
export function isDebug(role: Role | undefined | null): boolean {
  return role === "debug";
}
