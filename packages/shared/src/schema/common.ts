import { z } from "zod";

export const ulidSchema = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/);

export const unixMsSchema = z.number().int().nonnegative();

export const nonEmptyTrimmedStringSchema = z.string().trim().min(1);

export const optionalUrlSchema = z
  .string()
  .trim()
  .refine((value) => value.length === 0 || value.startsWith("data:") || /^https?:\/\//.test(value), {
    message: "Must be a valid URL or data URL",
  })
  .transform((value) => (value.length > 0 ? value : null));

export const serverUrlSchema = z.string().trim().url();

export const workspaceItemTypeSchema = z.enum(["chat", "doc"]);
