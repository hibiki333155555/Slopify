import { ulid } from "ulid";
import { eventPayloadSchema, eventSchema, type EventRecord } from "@slopify/shared";
import type { Pool } from "pg";

export type ServerUser = {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
};

type DbEventRow = {
  id: string;
  project_id: string;
  actor_user_id: string;
  type: string;
  payload_json: unknown;
  chat_channel_id: string | null;
  doc_id: string | null;
  created_at: string | number;
};

export class SyncRepository {
  public constructor(private readonly pool: Pool) {}

  public async upsertUser(input: ServerUser): Promise<void> {
    const now = Date.now();
    await this.pool.query(
      `
      INSERT INTO users (user_id, display_name, avatar_url, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $4)
      ON CONFLICT (user_id)
      DO UPDATE SET display_name = EXCLUDED.display_name, avatar_url = EXCLUDED.avatar_url, updated_at = EXCLUDED.updated_at
      `,
      [input.userId, input.displayName, input.avatarUrl, now],
    );
  }

  public async createInvite(projectId: string, createdByUserId: string): Promise<string> {
    const code = ulid().slice(-10);
    await this.pool.query(
      `
      INSERT INTO invites (invite_code, project_id, created_by_user_id, created_at)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (invite_code)
      DO UPDATE SET project_id = EXCLUDED.project_id, created_by_user_id = EXCLUDED.created_by_user_id, created_at = EXCLUDED.created_at
      `,
      [code, projectId, createdByUserId, Date.now()],
    );
    return code;
  }

  public async joinByInvite(input: {
    inviteCode: string;
    user: ServerUser;
  }): Promise<{ projectId: string; events: EventRecord[] }> {
    const inviteRes = await this.pool.query<{ project_id: string }>(
      "SELECT project_id FROM invites WHERE invite_code = $1",
      [input.inviteCode],
    );

    const projectId = inviteRes.rows[0]?.project_id;
    if (projectId === undefined) {
      throw new Error("Invite not found");
    }

    await this.upsertUser(input.user);

    const existingMember = await this.pool.query<{ project_id: string }>(
      "SELECT project_id FROM project_members WHERE project_id = $1 AND user_id = $2",
      [projectId, input.user.userId],
    );

    if (existingMember.rows.length === 0) {
      const joinedAt = Date.now();
      const memberEvent = eventSchema.parse({
        id: ulid(),
        projectId,
        actorUserId: input.user.userId,
        type: "member.joined",
        payload: {
          memberUserId: input.user.userId,
          memberDisplayName: input.user.displayName,
          memberAvatarUrl: input.user.avatarUrl,
        },
        chatChannelId: null,
        docId: null,
        createdAt: joinedAt,
      });

      await this.insertEvent(memberEvent);
      await this.applyProjection(memberEvent);
    }

    const events = await this.pullEvents([projectId], 0);
    return { projectId, events };
  }

  public async listProjectIdsForUser(userId: string): Promise<string[]> {
    const result = await this.pool.query<{ project_id: string }>(
      "SELECT project_id FROM project_members WHERE user_id = $1",
      [userId],
    );
    return result.rows.map((row) => row.project_id);
  }

  public async pullEvents(projectIds: string[], since: number): Promise<EventRecord[]> {
    if (projectIds.length === 0) {
      return [];
    }

    const params: unknown[] = [since, ...projectIds];
    const projectPlaceholders = projectIds.map((_value, index) => `$${index + 2}`).join(", ");

    const result = await this.pool.query<DbEventRow>(
      `
      SELECT id, project_id, actor_user_id, type, payload_json, chat_channel_id, doc_id, created_at
      FROM events
      WHERE created_at > $1
        AND project_id IN (${projectPlaceholders})
      ORDER BY created_at ASC
      `,
      params,
    );

    return result.rows.map((row) =>
      eventSchema.parse({
        id: row.id,
        projectId: row.project_id,
        actorUserId: row.actor_user_id,
        type: row.type,
        payload: row.payload_json,
        chatChannelId: row.chat_channel_id,
        docId: row.doc_id,
        createdAt: Number(row.created_at),
      }),
    );
  }

  public async pushEvents(inputEvents: EventRecord[]): Promise<string[]> {
    if (inputEvents.length === 0) {
      return [];
    }

    const accepted: string[] = [];

    for (const rawEvent of inputEvents) {
      const event = eventSchema.parse(rawEvent);
      const inserted = await this.insertEvent(event);
      if (!inserted) {
        continue;
      }
      accepted.push(event.id);
      await this.applyProjection(event);
    }

    return accepted;
  }

  private async insertEvent(event: EventRecord): Promise<boolean> {
    const result = await this.pool.query(
      `
      INSERT INTO events (id, project_id, actor_user_id, type, payload_json, chat_channel_id, doc_id, created_at)
      VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)
      ON CONFLICT (id) DO NOTHING
      `,
      [
        event.id,
        event.projectId,
        event.actorUserId,
        event.type,
        JSON.stringify(event.payload),
        event.chatChannelId,
        event.docId,
        event.createdAt,
      ],
    );

    return (result.rowCount ?? 0) > 0;
  }

  private async applyProjection(event: EventRecord): Promise<void> {
    const payload = eventPayloadSchema.parse({ type: event.type, payload: event.payload });

    await this.upsertProjectTimestamp(event.projectId, event.createdAt);

    switch (payload.type) {
      case "project.created": {
        await this.pool.query(
          `
          INSERT INTO projects (project_id, name, created_at, updated_at)
          VALUES ($1, $2, $3, $3)
          ON CONFLICT (project_id)
          DO UPDATE SET name = EXCLUDED.name, updated_at = EXCLUDED.updated_at
          `,
          [event.projectId, payload.payload.name, event.createdAt],
        );
        break;
      }
      case "member.joined": {
        await this.upsertUser({
          userId: payload.payload.memberUserId,
          displayName: payload.payload.memberDisplayName,
          avatarUrl: payload.payload.memberAvatarUrl,
        });
        await this.pool.query(
          `
          INSERT INTO project_members (project_id, user_id, joined_at)
          VALUES ($1, $2, $3)
          ON CONFLICT (project_id, user_id) DO NOTHING
          `,
          [event.projectId, payload.payload.memberUserId, event.createdAt],
        );
        break;
      }
      case "chat.created": {
        await this.pool.query(
          `
          INSERT INTO chat_channels (chat_channel_id, project_id, name, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $4)
          ON CONFLICT (chat_channel_id) DO NOTHING
          `,
          [payload.payload.chatChannelId, event.projectId, payload.payload.name, event.createdAt],
        );
        break;
      }
      case "chat.renamed": {
        await this.pool.query(
          "UPDATE chat_channels SET name = $1, updated_at = $2 WHERE chat_channel_id = $3",
          [payload.payload.name, event.createdAt, payload.payload.chatChannelId],
        );
        break;
      }
      case "decision.recorded": {
        await this.pool.query(
          `
          INSERT INTO decisions (decision_id, project_id, chat_channel_id, title, body, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $6)
          ON CONFLICT (decision_id) DO NOTHING
          `,
          [
            event.id,
            event.projectId,
            payload.payload.chatChannelId,
            payload.payload.title,
            payload.payload.body,
            event.createdAt,
          ],
        );
        break;
      }
      case "task.created": {
        await this.pool.query(
          `
          INSERT INTO tasks (task_id, project_id, chat_channel_id, title, completed, created_at, updated_at)
          VALUES ($1, $2, $3, $4, FALSE, $5, $5)
          ON CONFLICT (task_id) DO NOTHING
          `,
          [
            payload.payload.taskId,
            event.projectId,
            payload.payload.chatChannelId,
            payload.payload.title,
            event.createdAt,
          ],
        );
        break;
      }
      case "task.completed": {
        await this.pool.query(
          "UPDATE tasks SET completed = TRUE, updated_at = $1 WHERE task_id = $2",
          [event.createdAt, payload.payload.taskId],
        );
        break;
      }
      case "task.reopened": {
        await this.pool.query(
          "UPDATE tasks SET completed = FALSE, updated_at = $1 WHERE task_id = $2",
          [event.createdAt, payload.payload.taskId],
        );
        break;
      }
      case "doc.created": {
        await this.pool.query(
          `
          INSERT INTO docs (doc_id, project_id, title, markdown, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $5)
          ON CONFLICT (doc_id) DO NOTHING
          `,
          [
            payload.payload.docId,
            event.projectId,
            payload.payload.title,
            payload.payload.markdown,
            event.createdAt,
          ],
        );
        break;
      }
      case "doc.renamed": {
        await this.pool.query(
          "UPDATE docs SET title = $1, updated_at = $2 WHERE doc_id = $3",
          [payload.payload.title, event.createdAt, payload.payload.docId],
        );
        break;
      }
      case "doc.updated": {
        await this.pool.query(
          "UPDATE docs SET markdown = $1, updated_at = $2 WHERE doc_id = $3",
          [payload.payload.markdown, event.createdAt, payload.payload.docId],
        );
        break;
      }
      case "doc.comment.added": {
        await this.pool.query(
          `
          INSERT INTO doc_comments (comment_id, project_id, doc_id, author_user_id, body, anchor, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (comment_id) DO NOTHING
          `,
          [
            payload.payload.commentId,
            event.projectId,
            payload.payload.docId,
            event.actorUserId,
            payload.payload.body,
            payload.payload.anchor,
            event.createdAt,
          ],
        );
        break;
      }
      case "message.posted":
      case "message.reaction.added":
      case "message.reaction.removed": {
        break;
      }
    }
  }

  private async upsertProjectTimestamp(projectId: string, updatedAt: number): Promise<void> {
    await this.pool.query(
      `
      INSERT INTO projects (project_id, name, created_at, updated_at)
      VALUES ($1, COALESCE((SELECT name FROM projects WHERE project_id = $1), 'Untitled project'), $2, $2)
      ON CONFLICT (project_id)
      DO UPDATE SET updated_at = GREATEST(projects.updated_at, EXCLUDED.updated_at)
      `,
      [projectId, updatedAt],
    );
  }
}
