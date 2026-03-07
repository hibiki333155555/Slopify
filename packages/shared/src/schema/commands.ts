import { z } from "zod";
import {
  nonEmptyTrimmedStringSchema,
  optionalUrlSchema,
  ulidSchema,
  workspaceItemTypeSchema,
} from "./common.js";
import { setupInputSchema } from "./entities.js";

export const updateSettingsCommandSchema = z.object({
  displayName: nonEmptyTrimmedStringSchema,
  avatarUrl: optionalUrlSchema,
  serverUrl: z.string().trim().url(),
  serverAccessPassword: nonEmptyTrimmedStringSchema,
});

export const createProjectCommandSchema = z.object({
  name: nonEmptyTrimmedStringSchema,
});

export const joinProjectCommandSchema = z.object({
  inviteCode: nonEmptyTrimmedStringSchema,
});

export const createChatChannelCommandSchema = z.object({
  projectId: ulidSchema,
  name: nonEmptyTrimmedStringSchema,
});

export const renameChatChannelCommandSchema = z.object({
  projectId: ulidSchema,
  chatChannelId: ulidSchema,
  name: nonEmptyTrimmedStringSchema,
});

export const deleteChatChannelCommandSchema = z.object({
  projectId: ulidSchema,
  chatChannelId: ulidSchema,
});

export const postMessageCommandSchema = z.object({
  projectId: ulidSchema,
  chatChannelId: ulidSchema,
  body: z.string().trim(),
  imageDataUrl: z.string().optional(),
  replyToEventId: ulidSchema.optional(),
});

export const editMessageCommandSchema = z.object({
  projectId: ulidSchema,
  chatChannelId: ulidSchema,
  messageEventId: ulidSchema,
  body: z.string().trim().min(1),
});

export const deleteMessageCommandSchema = z.object({
  projectId: ulidSchema,
  chatChannelId: ulidSchema,
  messageEventId: ulidSchema,
});

export const addReactionCommandSchema = z.object({
  projectId: ulidSchema,
  chatChannelId: ulidSchema,
  messageEventId: ulidSchema,
  emoji: z.string(),
});

export const removeReactionCommandSchema = z.object({
  projectId: ulidSchema,
  chatChannelId: ulidSchema,
  messageEventId: ulidSchema,
  emoji: z.string(),
});

export const recordDecisionCommandSchema = z.object({
  projectId: ulidSchema,
  chatChannelId: ulidSchema,
  title: nonEmptyTrimmedStringSchema,
  body: nonEmptyTrimmedStringSchema,
});

export const createTaskCommandSchema = z.object({
  projectId: ulidSchema,
  chatChannelId: ulidSchema,
  title: nonEmptyTrimmedStringSchema,
});

export const updateTaskStatusCommandSchema = z.object({
  projectId: ulidSchema,
  taskId: ulidSchema,
  completed: z.boolean(),
});

export const createDocCommandSchema = z.object({
  projectId: ulidSchema,
  title: nonEmptyTrimmedStringSchema,
  markdown: z.string().default(""),
});

export const renameDocCommandSchema = z.object({
  projectId: ulidSchema,
  docId: ulidSchema,
  title: nonEmptyTrimmedStringSchema,
});

export const updateDocCommandSchema = z.object({
  projectId: ulidSchema,
  docId: ulidSchema,
  markdown: z.string(),
});

export const addDocCommentCommandSchema = z.object({
  projectId: ulidSchema,
  docId: ulidSchema,
  body: nonEmptyTrimmedStringSchema,
  anchor: z.string().nullable(),
});

export const timelineFilterSchema = z.object({
  projectId: ulidSchema,
  workspaceType: workspaceItemTypeSchema,
  workspaceItemId: ulidSchema,
});

export const setupCommandSchema = setupInputSchema;

export type SetupCommand = z.infer<typeof setupCommandSchema>;
export type UpdateSettingsCommand = z.infer<typeof updateSettingsCommandSchema>;
export type CreateProjectCommand = z.infer<typeof createProjectCommandSchema>;
export type JoinProjectCommand = z.infer<typeof joinProjectCommandSchema>;
export type CreateChatChannelCommand = z.infer<typeof createChatChannelCommandSchema>;
export type RenameChatChannelCommand = z.infer<typeof renameChatChannelCommandSchema>;
export type DeleteChatChannelCommand = z.infer<typeof deleteChatChannelCommandSchema>;
export type PostMessageCommand = z.infer<typeof postMessageCommandSchema>;
export type RecordDecisionCommand = z.infer<typeof recordDecisionCommandSchema>;
export type CreateTaskCommand = z.infer<typeof createTaskCommandSchema>;
export type UpdateTaskStatusCommand = z.infer<typeof updateTaskStatusCommandSchema>;
export type CreateDocCommand = z.infer<typeof createDocCommandSchema>;
export type RenameDocCommand = z.infer<typeof renameDocCommandSchema>;
export type UpdateDocCommand = z.infer<typeof updateDocCommandSchema>;
export type AddDocCommentCommand = z.infer<typeof addDocCommentCommandSchema>;
export type EditMessageCommand = z.infer<typeof editMessageCommandSchema>;
export type DeleteMessageCommand = z.infer<typeof deleteMessageCommandSchema>;
export type AddReactionCommand = z.infer<typeof addReactionCommandSchema>;
export type RemoveReactionCommand = z.infer<typeof removeReactionCommandSchema>;
export type TimelineFilter = z.infer<typeof timelineFilterSchema>;
