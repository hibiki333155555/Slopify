import { z } from "zod";
import {
  nonEmptyTrimmedStringSchema,
  ulidSchema,
  unixMsSchema,
  workspaceItemTypeSchema,
} from "./common.js";

export const eventTypeSchema = z.enum([
  "project.created",
  "member.joined",
  "chat.created",
  "chat.renamed",
  "message.posted",
  "message.edited",
  "message.deleted",
  "message.reaction.added",
  "message.reaction.removed",
  "decision.recorded",
  "task.created",
  "task.completed",
  "task.reopened",
  "doc.created",
  "doc.renamed",
  "doc.updated",
  "doc.comment.added",
]);

export const projectCreatedPayloadSchema = z.object({
  name: nonEmptyTrimmedStringSchema,
});

export const memberJoinedPayloadSchema = z.object({
  memberUserId: ulidSchema,
  memberDisplayName: nonEmptyTrimmedStringSchema,
  memberAvatarUrl: z.string().nullable(),
});

export const chatCreatedPayloadSchema = z.object({
  chatChannelId: ulidSchema,
  name: nonEmptyTrimmedStringSchema,
});

export const chatRenamedPayloadSchema = z.object({
  chatChannelId: ulidSchema,
  name: nonEmptyTrimmedStringSchema,
});

export const messagePostedPayloadSchema = z.object({
  chatChannelId: ulidSchema,
  body: z.string(),
  imageDataUrl: z.string().optional(),
  replyToEventId: ulidSchema.optional(),
});

export const messageEditedPayloadSchema = z.object({
  chatChannelId: ulidSchema,
  messageEventId: ulidSchema,
  body: z.string(),
});

export const messageDeletedPayloadSchema = z.object({
  chatChannelId: ulidSchema,
  messageEventId: ulidSchema,
});

export const messageReactionAddedPayloadSchema = z.object({
  chatChannelId: ulidSchema,
  messageEventId: ulidSchema,
  emoji: z.string(),
});

export const messageReactionRemovedPayloadSchema = z.object({
  chatChannelId: ulidSchema,
  messageEventId: ulidSchema,
  emoji: z.string(),
});

export const decisionRecordedPayloadSchema = z.object({
  chatChannelId: ulidSchema,
  title: nonEmptyTrimmedStringSchema,
  body: nonEmptyTrimmedStringSchema,
});

export const taskCreatedPayloadSchema = z.object({
  taskId: ulidSchema,
  chatChannelId: ulidSchema,
  title: nonEmptyTrimmedStringSchema,
});

export const taskCompletedPayloadSchema = z.object({
  taskId: ulidSchema,
});

export const taskReopenedPayloadSchema = z.object({
  taskId: ulidSchema,
});

export const docCreatedPayloadSchema = z.object({
  docId: ulidSchema,
  title: nonEmptyTrimmedStringSchema,
  markdown: z.string(),
});

export const docRenamedPayloadSchema = z.object({
  docId: ulidSchema,
  title: nonEmptyTrimmedStringSchema,
});

export const docUpdatedPayloadSchema = z.object({
  docId: ulidSchema,
  markdown: z.string(),
});

export const docCommentAddedPayloadSchema = z.object({
  docId: ulidSchema,
  commentId: ulidSchema,
  body: nonEmptyTrimmedStringSchema,
  anchor: z.string().nullable(),
});

export const eventPayloadSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("project.created"), payload: projectCreatedPayloadSchema }),
  z.object({ type: z.literal("member.joined"), payload: memberJoinedPayloadSchema }),
  z.object({ type: z.literal("chat.created"), payload: chatCreatedPayloadSchema }),
  z.object({ type: z.literal("chat.renamed"), payload: chatRenamedPayloadSchema }),
  z.object({ type: z.literal("message.posted"), payload: messagePostedPayloadSchema }),
  z.object({ type: z.literal("message.edited"), payload: messageEditedPayloadSchema }),
  z.object({ type: z.literal("message.deleted"), payload: messageDeletedPayloadSchema }),
  z.object({ type: z.literal("message.reaction.added"), payload: messageReactionAddedPayloadSchema }),
  z.object({ type: z.literal("message.reaction.removed"), payload: messageReactionRemovedPayloadSchema }),
  z.object({ type: z.literal("decision.recorded"), payload: decisionRecordedPayloadSchema }),
  z.object({ type: z.literal("task.created"), payload: taskCreatedPayloadSchema }),
  z.object({ type: z.literal("task.completed"), payload: taskCompletedPayloadSchema }),
  z.object({ type: z.literal("task.reopened"), payload: taskReopenedPayloadSchema }),
  z.object({ type: z.literal("doc.created"), payload: docCreatedPayloadSchema }),
  z.object({ type: z.literal("doc.renamed"), payload: docRenamedPayloadSchema }),
  z.object({ type: z.literal("doc.updated"), payload: docUpdatedPayloadSchema }),
  z.object({ type: z.literal("doc.comment.added"), payload: docCommentAddedPayloadSchema }),
]);

export const timelineDisplaySchema = z.object({
  workspaceType: workspaceItemTypeSchema,
  workspaceItemId: ulidSchema,
});

export const eventSchema = z
  .object({
    id: ulidSchema,
    projectId: ulidSchema,
    actorUserId: ulidSchema,
    type: eventTypeSchema,
    payload: z.record(z.string(), z.unknown()),
    chatChannelId: ulidSchema.nullable(),
    docId: ulidSchema.nullable(),
    createdAt: unixMsSchema,
  })
  .superRefine((value, ctx) => {
    const parsed = eventPayloadSchema.safeParse({ type: value.type, payload: value.payload });
    if (!parsed.success) {
      ctx.addIssue({ code: "custom", message: parsed.error.message });
      return;
    }

    if (
      (value.type === "message.posted" ||
        value.type === "message.edited" ||
        value.type === "message.deleted" ||
        value.type === "message.reaction.added" ||
        value.type === "message.reaction.removed" ||
        value.type === "decision.recorded" ||
        value.type === "task.created") &&
      value.chatChannelId === null
    ) {
      ctx.addIssue({
        code: "custom",
        message: "chatChannelId is required for chat timeline events",
      });
    }

    if (
      (value.type === "doc.created" ||
        value.type === "doc.renamed" ||
        value.type === "doc.updated" ||
        value.type === "doc.comment.added") &&
      value.docId === null
    ) {
      ctx.addIssue({ code: "custom", message: "docId is required for doc events" });
    }
  });

export type EventType = z.infer<typeof eventTypeSchema>;
export type EventRecord = z.infer<typeof eventSchema>;
export type EventPayload = z.infer<typeof eventPayloadSchema>;
