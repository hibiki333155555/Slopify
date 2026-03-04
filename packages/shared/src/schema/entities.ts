import { z } from "zod";
import { epochMsSchema, memberRoleSchema, projectStatusSchema, taskStatusSchema, ulidSchema } from "./common.js";
import { localTimelineEventSchema } from "./events.js";

export const profileSchema = z.object({
  userId: ulidSchema,
  deviceId: ulidSchema,
  displayName: z.string().trim().min(1).max(50),
  createdAt: epochMsSchema,
  updatedAt: epochMsSchema
});

export const userSchema = z.object({
  id: ulidSchema,
  displayName: z.string().trim().min(1).max(50),
  createdAt: epochMsSchema,
  updatedAt: epochMsSchema
});

export const projectSchema = z.object({
  id: ulidSchema,
  name: z.string().trim().min(1).max(100),
  description: z.string().max(200),
  status: projectStatusSchema,
  ownerUserId: ulidSchema,
  createdAt: epochMsSchema,
  updatedAt: epochMsSchema,
  archivedAt: epochMsSchema.nullable()
});

export const projectMemberSchema = z.object({
  projectId: ulidSchema,
  userId: ulidSchema,
  role: memberRoleSchema,
  joinedAt: epochMsSchema,
  leftAt: epochMsSchema.nullable(),
  displayName: z.string().trim().min(1).max(50)
});

export const decisionProjectionSchema = z.object({
  id: ulidSchema,
  projectId: ulidSchema,
  summary: z.string().trim().min(1).max(200),
  note: z.string().max(2000),
  createdEventId: ulidSchema,
  createdByUserId: ulidSchema,
  createdAt: epochMsSchema
});

export const taskProjectionSchema = z.object({
  id: ulidSchema,
  projectId: ulidSchema,
  title: z.string().trim().min(1).max(200),
  assigneeUserId: ulidSchema.nullable(),
  status: taskStatusSchema,
  createdEventId: ulidSchema,
  createdByUserId: ulidSchema,
  createdAt: epochMsSchema,
  completedAt: epochMsSchema.nullable(),
  completedByUserId: ulidSchema.nullable()
});

export const timelineFilterSchema = z.enum(["all", "message", "decision", "task", "openTasks"]);
export const composerModeSchema = z.enum(["message", "decision", "task"]);

export const projectListItemSchema = projectSchema.extend({
  unreadCount: z.number().int().nonnegative(),
  openTaskCount: z.number().int().nonnegative(),
  onlineCount: z.number().int().nonnegative(),
  lastUpdatedAt: epochMsSchema
});

export const roomSummarySchema = z.object({
  project: projectSchema,
  members: z.array(projectMemberSchema),
  latestDecisions: z.array(decisionProjectionSchema).max(3),
  openTaskCount: z.number().int().nonnegative(),
  onlineCount: z.number().int().nonnegative()
});

export const timelinePageSchema = z.object({
  events: z.array(localTimelineEventSchema),
  nextBeforeCreatedAt: epochMsSchema.nullable()
});

export const syncConnectionStateSchema = z.object({
  connected: z.boolean(),
  serverUrl: z.string().url()
});

export const syncUpdatePayloadSchema = z.object({
  projectId: ulidSchema
});

export const inviteInfoSchema = z.object({
  code: z.string().min(5).max(64),
  expiresAt: epochMsSchema
});

export const joinInviteResultSchema = z.object({
  projectId: ulidSchema
});
