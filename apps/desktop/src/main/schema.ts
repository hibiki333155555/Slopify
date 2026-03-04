import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const appMetaTable = sqliteTable("app_meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull()
});

export const usersTable = sqliteTable("users", {
  id: text("id").primaryKey(),
  displayName: text("display_name").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull()
});

export const projectsTable = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  status: text("status", { enum: ["active", "paused", "done", "archived"] }).notNull(),
  ownerUserId: text("owner_user_id").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
  archivedAt: integer("archived_at")
});

export const projectMembersTable = sqliteTable(
  "project_members",
  {
    projectId: text("project_id").notNull(),
    userId: text("user_id").notNull(),
    role: text("role", { enum: ["owner", "member"] }).notNull(),
    joinedAt: integer("joined_at").notNull(),
    leftAt: integer("left_at")
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.projectId, table.userId]
    })
  })
);

export const eventsTable = sqliteTable("events", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  seq: integer("seq"),
  actorUserId: text("actor_user_id").notNull(),
  eventType: text("event_type").notNull(),
  entityId: text("entity_id"),
  payloadJson: text("payload_json").notNull(),
  createdAt: integer("created_at").notNull(),
  serverCreatedAt: integer("server_created_at"),
  syncStatus: text("sync_status", { enum: ["pending", "synced", "failed"] }).notNull().default("pending"),
  retryCount: integer("retry_count").notNull().default(0)
});

export const decisionsTable = sqliteTable("decisions", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  summary: text("summary").notNull(),
  note: text("note").notNull().default(""),
  createdEventId: text("created_event_id").notNull().unique(),
  createdByUserId: text("created_by_user_id").notNull(),
  createdAt: integer("created_at").notNull()
});

export const tasksTable = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  title: text("title").notNull(),
  assigneeUserId: text("assignee_user_id"),
  status: text("status", { enum: ["open", "done"] }).notNull(),
  createdEventId: text("created_event_id").notNull().unique(),
  createdByUserId: text("created_by_user_id").notNull(),
  createdAt: integer("created_at").notNull(),
  completedAt: integer("completed_at"),
  completedByUserId: text("completed_by_user_id")
});

export const readCursorsTable = sqliteTable("read_cursors", {
  projectId: text("project_id").primaryKey(),
  lastReadSeq: integer("last_read_seq").notNull(),
  updatedAt: integer("updated_at").notNull()
});

export const projectSyncStateTable = sqliteTable("project_sync_state", {
  projectId: text("project_id").primaryKey(),
  lastPulledSeq: integer("last_pulled_seq").notNull(),
  lastSyncAt: integer("last_sync_at"),
  lastError: text("last_error")
});

export const schema = {
  appMetaTable,
  usersTable,
  projectsTable,
  projectMembersTable,
  eventsTable,
  decisionsTable,
  tasksTable,
  readCursorsTable,
  projectSyncStateTable
};
