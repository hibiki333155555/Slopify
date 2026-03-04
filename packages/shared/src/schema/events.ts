import { z } from "zod";
import { epochMsSchema, memberRoleSchema, syncStatusSchema, ulidSchema } from "./common.js";

export const eventTypes = [
  "project.created",
  "project.updated",
  "member.joined",
  "member.left",
  "message.posted",
  "decision.recorded",
  "task.created",
  "task.completed",
  "task.reopened"
] as const;

export const eventTypeSchema = z.enum(eventTypes);
export type EventType = (typeof eventTypes)[number];

export const projectCreatedPayloadSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().max(200).default(""),
  status: z.enum(["active", "paused", "done", "archived"]).default("active")
});

export const projectUpdatedPayloadSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    description: z.string().max(200).optional(),
    status: z.enum(["active", "paused", "done", "archived"]).optional()
  })
  .refine((value) => value.name !== undefined || value.description !== undefined || value.status !== undefined, {
    message: "project.updated requires at least one changed field"
  });

export const memberJoinedPayloadSchema = z.object({
  userId: ulidSchema,
  role: memberRoleSchema.default("member")
});

export const memberLeftPayloadSchema = z.object({
  userId: ulidSchema
});

export const messagePostedPayloadSchema = z.object({
  body: z.string().trim().min(1)
});

export const decisionRecordedPayloadSchema = z.object({
  decisionId: ulidSchema,
  summary: z.string().trim().min(1).max(200),
  note: z.string().max(2000).default("")
});

export const taskCreatedPayloadSchema = z.object({
  taskId: ulidSchema,
  title: z.string().trim().min(1).max(200),
  assigneeUserId: ulidSchema.nullable()
});

export const taskCompletedPayloadSchema = z.object({
  taskId: ulidSchema
});

export const taskReopenedPayloadSchema = z.object({
  taskId: ulidSchema
});

export type EventPayloadByType = {
  "project.created": z.infer<typeof projectCreatedPayloadSchema>;
  "project.updated": z.infer<typeof projectUpdatedPayloadSchema>;
  "member.joined": z.infer<typeof memberJoinedPayloadSchema>;
  "member.left": z.infer<typeof memberLeftPayloadSchema>;
  "message.posted": z.infer<typeof messagePostedPayloadSchema>;
  "decision.recorded": z.infer<typeof decisionRecordedPayloadSchema>;
  "task.created": z.infer<typeof taskCreatedPayloadSchema>;
  "task.completed": z.infer<typeof taskCompletedPayloadSchema>;
  "task.reopened": z.infer<typeof taskReopenedPayloadSchema>;
};

export const eventPayloadSchemas = {
  "project.created": projectCreatedPayloadSchema,
  "project.updated": projectUpdatedPayloadSchema,
  "member.joined": memberJoinedPayloadSchema,
  "member.left": memberLeftPayloadSchema,
  "message.posted": messagePostedPayloadSchema,
  "decision.recorded": decisionRecordedPayloadSchema,
  "task.created": taskCreatedPayloadSchema,
  "task.completed": taskCompletedPayloadSchema,
  "task.reopened": taskReopenedPayloadSchema
} as const;

export function parsePayloadForEventType<T extends EventType>(eventType: T, payload: unknown): EventPayloadByType[T] {
  return eventPayloadSchemas[eventType].parse(payload) as EventPayloadByType[T];
}

const localEventBaseSchema = z.object({
  id: ulidSchema,
  projectId: ulidSchema,
  seq: z.number().int().positive().nullable(),
  actorUserId: ulidSchema,
  entityId: ulidSchema.nullable(),
  createdAt: epochMsSchema,
  serverCreatedAt: epochMsSchema.nullable(),
  syncStatus: syncStatusSchema,
  retryCount: z.number().int().nonnegative()
});

const clientSyncEventBaseSchema = z.object({
  id: ulidSchema,
  projectId: ulidSchema,
  actorUserId: ulidSchema,
  entityId: ulidSchema.nullable(),
  createdAt: epochMsSchema
});

const serverSyncEventBaseSchema = clientSyncEventBaseSchema.extend({
  seq: z.number().int().positive(),
  serverCreatedAt: epochMsSchema
});

const localProjectCreatedEventSchema = localEventBaseSchema.extend({
  eventType: z.literal("project.created"),
  payload: projectCreatedPayloadSchema
});
const localProjectUpdatedEventSchema = localEventBaseSchema.extend({
  eventType: z.literal("project.updated"),
  payload: projectUpdatedPayloadSchema
});
const localMemberJoinedEventSchema = localEventBaseSchema.extend({
  eventType: z.literal("member.joined"),
  payload: memberJoinedPayloadSchema
});
const localMemberLeftEventSchema = localEventBaseSchema.extend({
  eventType: z.literal("member.left"),
  payload: memberLeftPayloadSchema
});
const localMessagePostedEventSchema = localEventBaseSchema.extend({
  eventType: z.literal("message.posted"),
  payload: messagePostedPayloadSchema
});
const localDecisionRecordedEventSchema = localEventBaseSchema.extend({
  eventType: z.literal("decision.recorded"),
  payload: decisionRecordedPayloadSchema
});
const localTaskCreatedEventSchema = localEventBaseSchema.extend({
  eventType: z.literal("task.created"),
  payload: taskCreatedPayloadSchema
});
const localTaskCompletedEventSchema = localEventBaseSchema.extend({
  eventType: z.literal("task.completed"),
  payload: taskCompletedPayloadSchema
});
const localTaskReopenedEventSchema = localEventBaseSchema.extend({
  eventType: z.literal("task.reopened"),
  payload: taskReopenedPayloadSchema
});

export const localTimelineEventSchema = z.discriminatedUnion("eventType", [
  localProjectCreatedEventSchema,
  localProjectUpdatedEventSchema,
  localMemberJoinedEventSchema,
  localMemberLeftEventSchema,
  localMessagePostedEventSchema,
  localDecisionRecordedEventSchema,
  localTaskCreatedEventSchema,
  localTaskCompletedEventSchema,
  localTaskReopenedEventSchema
]);

const clientProjectCreatedEventSchema = clientSyncEventBaseSchema.extend({
  eventType: z.literal("project.created"),
  payload: projectCreatedPayloadSchema
});
const clientProjectUpdatedEventSchema = clientSyncEventBaseSchema.extend({
  eventType: z.literal("project.updated"),
  payload: projectUpdatedPayloadSchema
});
const clientMemberJoinedEventSchema = clientSyncEventBaseSchema.extend({
  eventType: z.literal("member.joined"),
  payload: memberJoinedPayloadSchema
});
const clientMemberLeftEventSchema = clientSyncEventBaseSchema.extend({
  eventType: z.literal("member.left"),
  payload: memberLeftPayloadSchema
});
const clientMessagePostedEventSchema = clientSyncEventBaseSchema.extend({
  eventType: z.literal("message.posted"),
  payload: messagePostedPayloadSchema
});
const clientDecisionRecordedEventSchema = clientSyncEventBaseSchema.extend({
  eventType: z.literal("decision.recorded"),
  payload: decisionRecordedPayloadSchema
});
const clientTaskCreatedEventSchema = clientSyncEventBaseSchema.extend({
  eventType: z.literal("task.created"),
  payload: taskCreatedPayloadSchema
});
const clientTaskCompletedEventSchema = clientSyncEventBaseSchema.extend({
  eventType: z.literal("task.completed"),
  payload: taskCompletedPayloadSchema
});
const clientTaskReopenedEventSchema = clientSyncEventBaseSchema.extend({
  eventType: z.literal("task.reopened"),
  payload: taskReopenedPayloadSchema
});

export const clientSyncEventSchema = z.discriminatedUnion("eventType", [
  clientProjectCreatedEventSchema,
  clientProjectUpdatedEventSchema,
  clientMemberJoinedEventSchema,
  clientMemberLeftEventSchema,
  clientMessagePostedEventSchema,
  clientDecisionRecordedEventSchema,
  clientTaskCreatedEventSchema,
  clientTaskCompletedEventSchema,
  clientTaskReopenedEventSchema
]);

const serverProjectCreatedEventSchema = serverSyncEventBaseSchema.extend({
  eventType: z.literal("project.created"),
  payload: projectCreatedPayloadSchema
});
const serverProjectUpdatedEventSchema = serverSyncEventBaseSchema.extend({
  eventType: z.literal("project.updated"),
  payload: projectUpdatedPayloadSchema
});
const serverMemberJoinedEventSchema = serverSyncEventBaseSchema.extend({
  eventType: z.literal("member.joined"),
  payload: memberJoinedPayloadSchema
});
const serverMemberLeftEventSchema = serverSyncEventBaseSchema.extend({
  eventType: z.literal("member.left"),
  payload: memberLeftPayloadSchema
});
const serverMessagePostedEventSchema = serverSyncEventBaseSchema.extend({
  eventType: z.literal("message.posted"),
  payload: messagePostedPayloadSchema
});
const serverDecisionRecordedEventSchema = serverSyncEventBaseSchema.extend({
  eventType: z.literal("decision.recorded"),
  payload: decisionRecordedPayloadSchema
});
const serverTaskCreatedEventSchema = serverSyncEventBaseSchema.extend({
  eventType: z.literal("task.created"),
  payload: taskCreatedPayloadSchema
});
const serverTaskCompletedEventSchema = serverSyncEventBaseSchema.extend({
  eventType: z.literal("task.completed"),
  payload: taskCompletedPayloadSchema
});
const serverTaskReopenedEventSchema = serverSyncEventBaseSchema.extend({
  eventType: z.literal("task.reopened"),
  payload: taskReopenedPayloadSchema
});

export const serverSyncEventSchema = z.discriminatedUnion("eventType", [
  serverProjectCreatedEventSchema,
  serverProjectUpdatedEventSchema,
  serverMemberJoinedEventSchema,
  serverMemberLeftEventSchema,
  serverMessagePostedEventSchema,
  serverDecisionRecordedEventSchema,
  serverTaskCreatedEventSchema,
  serverTaskCompletedEventSchema,
  serverTaskReopenedEventSchema
]);

export const syncAckSchema = z.object({
  eventId: ulidSchema,
  projectId: ulidSchema,
  seq: z.number().int().positive(),
  serverCreatedAt: epochMsSchema
});
