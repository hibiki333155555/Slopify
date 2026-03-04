import { z } from "zod";
import {
  nonEmptyTrimmedStringSchema,
  optionalUrlSchema,
  serverUrlSchema,
  ulidSchema,
  unixMsSchema,
  workspaceItemTypeSchema,
} from "./common.js";
import { eventSchema, eventTypeSchema } from "./events.js";

export const userProfileSchema = z.object({
  userId: ulidSchema,
  displayName: nonEmptyTrimmedStringSchema,
  avatarUrl: z.string().nullable(),
  createdAt: unixMsSchema,
});

export const setupInputSchema = z.object({
  displayName: nonEmptyTrimmedStringSchema,
  avatarUrl: optionalUrlSchema,
  serverUrl: serverUrlSchema,
  serverAccessPassword: nonEmptyTrimmedStringSchema,
});

export const connectionConfigSchema = z.object({
  serverUrl: serverUrlSchema,
  serverAccessPassword: nonEmptyTrimmedStringSchema,
});

export const settingsSchema = z.object({
  displayName: nonEmptyTrimmedStringSchema,
  avatarUrl: z.string().nullable(),
  serverUrl: serverUrlSchema,
});

export const memberSchema = z.object({
  projectId: ulidSchema,
  userId: ulidSchema,
  displayName: nonEmptyTrimmedStringSchema,
  avatarUrl: z.string().nullable(),
  joinedAt: unixMsSchema,
});

export const projectSummarySchema = z.object({
  projectId: ulidSchema,
  name: nonEmptyTrimmedStringSchema,
  createdAt: unixMsSchema,
  updatedAt: unixMsSchema,
  memberCount: z.number().int().nonnegative(),
  lastActivityAt: unixMsSchema,
});

export const chatChannelSchema = z.object({
  chatChannelId: ulidSchema,
  projectId: ulidSchema,
  name: nonEmptyTrimmedStringSchema,
  createdAt: unixMsSchema,
  updatedAt: unixMsSchema,
});

export const taskSchema = z.object({
  taskId: ulidSchema,
  projectId: ulidSchema,
  chatChannelId: ulidSchema,
  title: nonEmptyTrimmedStringSchema,
  completed: z.boolean(),
  createdAt: unixMsSchema,
  updatedAt: unixMsSchema,
});

export const decisionSchema = z.object({
  decisionId: ulidSchema,
  projectId: ulidSchema,
  chatChannelId: ulidSchema,
  title: nonEmptyTrimmedStringSchema,
  body: nonEmptyTrimmedStringSchema,
  createdAt: unixMsSchema,
  updatedAt: unixMsSchema,
});

export const docSchema = z.object({
  docId: ulidSchema,
  projectId: ulidSchema,
  title: nonEmptyTrimmedStringSchema,
  markdown: z.string(),
  createdAt: unixMsSchema,
  updatedAt: unixMsSchema,
});

export const docCommentSchema = z.object({
  commentId: ulidSchema,
  projectId: ulidSchema,
  docId: ulidSchema,
  authorUserId: ulidSchema,
  body: nonEmptyTrimmedStringSchema,
  anchor: z.string().nullable(),
  createdAt: unixMsSchema,
});

export const timelineEventSchema = z.object({
  id: ulidSchema,
  projectId: ulidSchema,
  actorUserId: ulidSchema,
  type: eventTypeSchema,
  payload: z.record(z.string(), z.unknown()),
  chatChannelId: ulidSchema.nullable(),
  docId: ulidSchema.nullable(),
  createdAt: unixMsSchema,
  actorDisplayName: nonEmptyTrimmedStringSchema,
  actorAvatarUrl: z.string().nullable(),
  timelineText: nonEmptyTrimmedStringSchema,
});

export const workspaceStateSchema = z.object({
  project: projectSummarySchema,
  members: z.array(memberSchema),
  channels: z.array(chatChannelSchema),
  tasks: z.array(taskSchema),
  decisions: z.array(decisionSchema),
  docs: z.array(docSchema),
  selectedWorkspaceType: workspaceItemTypeSchema,
  selectedWorkspaceItemId: ulidSchema,
});

export const bootstrapSchema = z.object({
  hasCompletedSetup: z.boolean(),
  me: userProfileSchema.nullable(),
  settings: settingsSchema.nullable(),
});

export type UserProfile = z.infer<typeof userProfileSchema>;
export type SetupInput = z.infer<typeof setupInputSchema>;
export type ConnectionConfig = z.infer<typeof connectionConfigSchema>;
export type Settings = z.infer<typeof settingsSchema>;
export type ProjectSummary = z.infer<typeof projectSummarySchema>;
export type Member = z.infer<typeof memberSchema>;
export type ChatChannel = z.infer<typeof chatChannelSchema>;
export type Task = z.infer<typeof taskSchema>;
export type Decision = z.infer<typeof decisionSchema>;
export type Doc = z.infer<typeof docSchema>;
export type DocComment = z.infer<typeof docCommentSchema>;
export type TimelineEvent = z.infer<typeof timelineEventSchema>;
export type WorkspaceState = z.infer<typeof workspaceStateSchema>;
export type Bootstrap = z.infer<typeof bootstrapSchema>;
