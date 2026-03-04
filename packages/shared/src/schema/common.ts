import { z } from "zod";

export const ulidSchema = z
  .string()
  .regex(/^[0-9A-HJKMNP-TV-Z]{26}$/, "ULID must be a 26-char Crockford base32 value");

export const epochMsSchema = z.number().int().nonnegative();

export const projectStatusSchema = z.enum(["active", "paused", "done", "archived"]);
export const memberRoleSchema = z.enum(["owner", "member"]);
export const taskStatusSchema = z.enum(["open", "done"]);
export const syncStatusSchema = z.enum(["pending", "synced", "failed"]);
