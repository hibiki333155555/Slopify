import { z } from "zod";
import { epochMsSchema, projectStatusSchema, ulidSchema } from "./common.js";
import { timelineFilterSchema } from "./entities.js";

export const profileSetupInputSchema = z.object({
  displayName: z.string().trim().min(1).max(50)
});

export const createProjectInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().max(200).default(""),
  status: projectStatusSchema.default("active")
});

export const listProjectsInputSchema = z.object({
  status: z.union([projectStatusSchema, z.literal("all")]).default("all")
});

export const listTimelineInputSchema = z.object({
  projectId: ulidSchema,
  limit: z.number().int().min(1).max(200).default(100),
  beforeCreatedAt: epochMsSchema.optional(),
  filter: timelineFilterSchema.default("all")
});

export const postMessageInputSchema = z.object({
  projectId: ulidSchema,
  body: z.string().trim().min(1)
});

export const recordDecisionInputSchema = z.object({
  projectId: ulidSchema,
  summary: z.string().trim().min(1).max(200),
  note: z.string().max(2000).default("")
});

export const createTaskInputSchema = z.object({
  projectId: ulidSchema,
  title: z.string().trim().min(1).max(200),
  assigneeUserId: ulidSchema.nullable()
});

export const completeTaskInputSchema = z.object({
  projectId: ulidSchema,
  taskId: ulidSchema
});

export const reopenTaskInputSchema = z.object({
  projectId: ulidSchema,
  taskId: ulidSchema
});

export const markReadInputSchema = z.object({
  projectId: ulidSchema,
  lastReadSeq: z.number().int().nonnegative()
});

export const createInviteInputSchema = z.object({
  projectId: ulidSchema,
  expiresInDays: z.number().int().min(1).max(30).default(7)
});

export const joinInviteInputSchema = z.object({
  code: z.string().trim().min(5).max(64)
});
