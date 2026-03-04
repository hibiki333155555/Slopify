import type { z } from "zod";
import {
  completeTaskInputSchema,
  createInviteInputSchema,
  createProjectInputSchema,
  createTaskInputSchema,
  joinInviteInputSchema,
  listTimelineInputSchema,
  markReadInputSchema,
  postMessageInputSchema,
  profileSetupInputSchema,
  recordDecisionInputSchema,
  reopenTaskInputSchema
} from "../schema/commands.js";
import {
  composerModeSchema,
  decisionProjectionSchema,
  inviteInfoSchema,
  joinInviteResultSchema,
  profileSchema,
  projectListItemSchema,
  projectMemberSchema,
  projectSchema,
  roomSummarySchema,
  syncConnectionStateSchema,
  syncUpdatePayloadSchema,
  taskProjectionSchema,
  timelineFilterSchema,
  timelinePageSchema
} from "../schema/entities.js";
import {
  clientSyncEventSchema,
  localTimelineEventSchema,
  serverSyncEventSchema,
  syncAckSchema
} from "../schema/events.js";
import type { EventPayloadByType, EventType } from "../schema/events.js";

export type EventPayloadMap = EventPayloadByType;
export type Project = z.infer<typeof projectSchema>;
export type ProjectMember = z.infer<typeof projectMemberSchema>;
export type Profile = z.infer<typeof profileSchema>;
export type ProjectListItem = z.infer<typeof projectListItemSchema>;
export type DecisionProjection = z.infer<typeof decisionProjectionSchema>;
export type TaskProjection = z.infer<typeof taskProjectionSchema>;
export type RoomSummary = z.infer<typeof roomSummarySchema>;
export type TimelineFilter = z.infer<typeof timelineFilterSchema>;
export type ComposerMode = z.infer<typeof composerModeSchema>;
export type TimelinePage = z.infer<typeof timelinePageSchema>;
export type LocalTimelineEvent = z.infer<typeof localTimelineEventSchema>;
export type ClientSyncEvent = z.infer<typeof clientSyncEventSchema>;
export type ServerSyncEvent = z.infer<typeof serverSyncEventSchema>;
export type SyncAck = z.infer<typeof syncAckSchema>;
export type SyncConnectionState = z.infer<typeof syncConnectionStateSchema>;
export type SyncUpdatePayload = z.infer<typeof syncUpdatePayloadSchema>;
export type InviteInfo = z.infer<typeof inviteInfoSchema>;
export type JoinInviteResult = z.infer<typeof joinInviteResultSchema>;

export type ProfileSetupInput = z.infer<typeof profileSetupInputSchema>;
export type CreateProjectInput = z.infer<typeof createProjectInputSchema>;
export type ListTimelineInput = z.infer<typeof listTimelineInputSchema>;
export type PostMessageInput = z.infer<typeof postMessageInputSchema>;
export type RecordDecisionInput = z.infer<typeof recordDecisionInputSchema>;
export type CreateTaskInput = z.infer<typeof createTaskInputSchema>;
export type CompleteTaskInput = z.infer<typeof completeTaskInputSchema>;
export type ReopenTaskInput = z.infer<typeof reopenTaskInputSchema>;
export type MarkReadInput = z.infer<typeof markReadInputSchema>;
export type CreateInviteInput = z.infer<typeof createInviteInputSchema>;
export type JoinInviteInput = z.infer<typeof joinInviteInputSchema>;

export interface DesktopApi {
  profile: {
    get: () => Promise<Profile | null>;
    setup: (input: ProfileSetupInput) => Promise<Profile>;
  };
  projects: {
    list: (status?: Project["status"] | "all") => Promise<ProjectListItem[]>;
    create: (input: CreateProjectInput) => Promise<Project>;
    roomSummary: (projectId: string) => Promise<RoomSummary>;
    openTasks: (projectId: string) => Promise<TaskProjection[]>;
  };
  timeline: {
    list: (input: ListTimelineInput) => Promise<TimelinePage>;
    postMessage: (input: PostMessageInput) => Promise<LocalTimelineEvent>;
    recordDecision: (input: RecordDecisionInput) => Promise<LocalTimelineEvent>;
    createTask: (input: CreateTaskInput) => Promise<LocalTimelineEvent>;
    completeTask: (input: CompleteTaskInput) => Promise<LocalTimelineEvent>;
    reopenTask: (input: ReopenTaskInput) => Promise<LocalTimelineEvent>;
    markRead: (input: MarkReadInput) => Promise<void>;
  };
  invite: {
    create: (input: CreateInviteInput) => Promise<InviteInfo>;
    join: (input: JoinInviteInput) => Promise<JoinInviteResult>;
  };
  sync: {
    connect: () => Promise<SyncConnectionState>;
    disconnect: () => Promise<SyncConnectionState>;
    status: () => Promise<SyncConnectionState>;
    onUpdated: (listener: (payload: SyncUpdatePayload) => void) => () => void;
  };
}

export type { EventType };
