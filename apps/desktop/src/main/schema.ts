import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const appMeta = sqliteTable("app_meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const users = sqliteTable("users", {
  userId: text("user_id").primaryKey(),
  displayName: text("display_name").notNull(),
  avatarUrl: text("avatar_url"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const projects = sqliteTable("projects", {
  projectId: text("project_id").primaryKey(),
  name: text("name").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const projectMembers = sqliteTable(
  "project_members",
  {
    projectId: text("project_id").notNull(),
    userId: text("user_id").notNull(),
    joinedAt: integer("joined_at").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.projectId, table.userId] }),
  }),
);

export const chatChannels = sqliteTable("chat_channels", {
  chatChannelId: text("chat_channel_id").primaryKey(),
  projectId: text("project_id").notNull(),
  name: text("name").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const docs = sqliteTable("docs", {
  docId: text("doc_id").primaryKey(),
  projectId: text("project_id").notNull(),
  title: text("title").notNull(),
  markdown: text("markdown").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const docComments = sqliteTable("doc_comments", {
  commentId: text("comment_id").primaryKey(),
  projectId: text("project_id").notNull(),
  docId: text("doc_id").notNull(),
  authorUserId: text("author_user_id").notNull(),
  body: text("body").notNull(),
  anchor: text("anchor"),
  createdAt: integer("created_at").notNull(),
});

export const tasks = sqliteTable("tasks", {
  taskId: text("task_id").primaryKey(),
  projectId: text("project_id").notNull(),
  chatChannelId: text("chat_channel_id").notNull(),
  title: text("title").notNull(),
  completed: integer("completed", { mode: "boolean" }).notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const decisions = sqliteTable("decisions", {
  decisionId: text("decision_id").primaryKey(),
  projectId: text("project_id").notNull(),
  chatChannelId: text("chat_channel_id").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const events = sqliteTable("events", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  actorUserId: text("actor_user_id").notNull(),
  type: text("type").notNull(),
  payloadJson: text("payload_json").notNull(),
  chatChannelId: text("chat_channel_id"),
  docId: text("doc_id"),
  createdAt: integer("created_at").notNull(),
  syncStatus: text("sync_status").notNull(),
});

export const invites = sqliteTable("invites", {
  projectId: text("project_id").primaryKey(),
  inviteCode: text("invite_code").notNull(),
  createdAt: integer("created_at").notNull(),
});
