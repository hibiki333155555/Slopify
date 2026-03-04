import {
  type ClientSyncEvent,
  type EventType,
  type ProjectMember,
  type ServerSyncEvent,
  parsePayloadForEventType,
  projectSchema,
  serverSyncEventSchema
} from "@slopify/shared";
import { ulid } from "ulid";
import type { Pool, PoolClient } from "pg";

type EventRow = {
  id: string;
  project_id: string;
  seq: string | number;
  actor_user_id: string;
  event_type: EventType;
  entity_id: string | null;
  payload_json: string;
  created_at: string | number;
  server_created_at: string | number;
};

type ProjectRow = {
  id: string;
  name: string;
  description: string;
  status: "active" | "paused" | "done" | "archived";
  owner_user_id: string;
  created_at: string | number;
  updated_at: string | number;
  archived_at: string | number | null;
};

type MemberRow = {
  project_id: string;
  user_id: string;
  role: "owner" | "member";
  joined_at: string | number;
  left_at: string | number | null;
};

export type JoinByInviteResult = {
  project: ReturnType<typeof projectSchema.parse>;
  members: ProjectMember[];
  events: ServerSyncEvent[];
};

export class SyncRepository {
  public constructor(private readonly pool: Pool) {}

  public async isMember(projectId: string, userId: string): Promise<boolean> {
    const result = await this.pool.query<{ exists: boolean }>(
      "SELECT EXISTS(SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2 AND left_at IS NULL) AS exists",
      [projectId, userId]
    );
    return result.rows[0]?.exists ?? false;
  }

  public async appendClientEvents(events: ClientSyncEvent[]): Promise<{
    acks: Array<{ eventId: string; projectId: string; seq: number; serverCreatedAt: number }>;
    insertedByProject: Map<string, ServerSyncEvent[]>;
  }> {
    const acks: Array<{ eventId: string; projectId: string; seq: number; serverCreatedAt: number }> = [];
    const insertedByProject = new Map<string, ServerSyncEvent[]>();

    for (const event of events) {
      const client = await this.pool.connect();
      try {
        await client.query("BEGIN");
        const serverEvent = await this.appendEventInTransaction(client, event);
        await client.query("COMMIT");

        acks.push({
          eventId: serverEvent.id,
          projectId: serverEvent.projectId,
          seq: serverEvent.seq,
          serverCreatedAt: serverEvent.serverCreatedAt
        });

        const existing = insertedByProject.get(serverEvent.projectId) ?? [];
        existing.push(serverEvent);
        insertedByProject.set(serverEvent.projectId, existing);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    }

    return { acks, insertedByProject };
  }

  public async pullEvents(projectId: string, sinceSeq: number, limit = 500): Promise<ServerSyncEvent[]> {
    const client = await this.pool.connect();
    try {
      return this.pullEventsByClient(client, projectId, sinceSeq, limit);
    } finally {
      client.release();
    }
  }

  private async pullEventsByClient(
    client: PoolClient,
    projectId: string,
    sinceSeq: number,
    limit: number
  ): Promise<ServerSyncEvent[]> {
    const result = await client.query<EventRow>(
      `
      SELECT id, project_id, seq, actor_user_id, event_type, entity_id, payload_json, created_at, server_created_at
      FROM events
      WHERE project_id = $1
        AND seq > $2
      ORDER BY seq ASC
      LIMIT $3
      `,
      [projectId, sinceSeq, limit]
    );

    return result.rows.map((row) => this.rowToServerEvent(row));
  }

  public async createInvite(projectId: string, userId: string, expiresInDays = 7): Promise<{ code: string; expiresAt: number }> {
    const code = ulid().slice(-10);
    const now = Date.now();
    const expiresAt = now + expiresInDays * 24 * 60 * 60 * 1000;

    await this.pool.query(
      `
      INSERT INTO invites (code, project_id, created_by_user_id, expires_at, created_at)
      VALUES ($1, $2, $3, $4, $5)
      `,
      [code, projectId, userId, expiresAt, now]
    );

    return { code, expiresAt };
  }

  public async joinByInvite(code: string, userId: string): Promise<JoinByInviteResult> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const inviteResult = await client.query<{ project_id: string; expires_at: string | number }>(
        "SELECT project_id, expires_at FROM invites WHERE code = $1",
        [code]
      );
      const invite = inviteResult.rows[0];
      if (!invite) {
        throw new Error("Invite code not found");
      }
      if (Number(invite.expires_at) < Date.now()) {
        throw new Error("Invite code has expired");
      }

      await client.query(
        `
        INSERT INTO project_members (project_id, user_id, role, joined_at, left_at)
        VALUES ($1, $2, 'member', $3, NULL)
        ON CONFLICT (project_id, user_id)
        DO UPDATE SET left_at = NULL, joined_at = EXCLUDED.joined_at
        `,
        [invite.project_id, userId, Date.now()]
      );

      await this.appendEventInTransaction(client, {
        id: ulid(),
        projectId: invite.project_id,
        actorUserId: userId,
        eventType: "member.joined",
        entityId: userId,
        payload: {
          userId,
          role: "member"
        },
        createdAt: Date.now()
      });

      const projectResult = await client.query<ProjectRow>(
        `
        SELECT id, name, description, status, owner_user_id, created_at, updated_at, archived_at
        FROM projects
        WHERE id = $1
        `,
        [invite.project_id]
      );
      const projectRow = projectResult.rows[0];
      if (!projectRow) {
        throw new Error("Project not found for invite");
      }

      const members = await this.listMembersByClient(client, invite.project_id);
      const events = await this.pullEventsByClient(client, invite.project_id, 0, 10000);

      await client.query("COMMIT");

      const project = projectSchema.parse({
        id: projectRow.id,
        name: projectRow.name,
        description: projectRow.description,
        status: projectRow.status,
        ownerUserId: projectRow.owner_user_id,
        createdAt: Number(projectRow.created_at),
        updatedAt: Number(projectRow.updated_at),
        archivedAt: projectRow.archived_at === null ? null : Number(projectRow.archived_at)
      });

      return { project, members, events };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  public async listMembers(projectId: string): Promise<ProjectMember[]> {
    const client = await this.pool.connect();
    try {
      return this.listMembersByClient(client, projectId);
    } finally {
      client.release();
    }
  }

  private async listMembersByClient(client: PoolClient, projectId: string): Promise<ProjectMember[]> {
    const result = await client.query<MemberRow>(
      `
      SELECT project_id, user_id, role, joined_at, left_at
      FROM project_members
      WHERE project_id = $1
      ORDER BY joined_at ASC
      `,
      [projectId]
    );

    return result.rows.map((row) => ({
      projectId: row.project_id,
      userId: row.user_id,
      role: row.role,
      joinedAt: Number(row.joined_at),
      leftAt: row.left_at === null ? null : Number(row.left_at),
      displayName: row.user_id
    }));
  }

  private async appendEventInTransaction(client: PoolClient, event: ClientSyncEvent): Promise<ServerSyncEvent> {
    const existingResult = await client.query<EventRow>(
      `
      SELECT id, project_id, seq, actor_user_id, event_type, entity_id, payload_json, created_at, server_created_at
      FROM events
      WHERE id = $1
      `,
      [event.id]
    );

    const existing = existingResult.rows[0];
    if (existing) {
      return this.rowToServerEvent(existing);
    }

    const payload = parsePayloadForEventType(event.eventType, event.payload);
    const payloadJson = JSON.stringify(payload);
    const serverCreatedAt = Date.now();

    const seqResult = await client.query<{ last_seq: string | number }>(
      `
      INSERT INTO project_sequences (project_id, last_seq)
      VALUES ($1, 1)
      ON CONFLICT (project_id)
      DO UPDATE SET last_seq = project_sequences.last_seq + 1
      RETURNING last_seq
      `,
      [event.projectId]
    );
    const seq = Number(seqResult.rows[0]?.last_seq ?? 1);

    await client.query(
      `
      INSERT INTO events (id, project_id, seq, actor_user_id, event_type, entity_id, payload_json, created_at, server_created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `,
      [
        event.id,
        event.projectId,
        seq,
        event.actorUserId,
        event.eventType,
        event.entityId,
        payloadJson,
        event.createdAt,
        serverCreatedAt
      ]
    );

    await this.applyProjection(client, event, seq);

    return serverSyncEventSchema.parse({
      ...event,
      payload,
      seq,
      serverCreatedAt
    });
  }

  private async applyProjection(client: PoolClient, event: ClientSyncEvent, seq: number): Promise<void> {
    switch (event.eventType) {
      case "project.created": {
        const payload = parsePayloadForEventType(event.eventType, event.payload);
        await client.query(
          `
          INSERT INTO projects (id, name, description, status, owner_user_id, created_at, updated_at, archived_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, NULL)
          ON CONFLICT (id)
          DO UPDATE SET
            name = EXCLUDED.name,
            description = EXCLUDED.description,
            status = EXCLUDED.status,
            updated_at = EXCLUDED.updated_at
          `,
          [event.projectId, payload.name, payload.description, payload.status, event.actorUserId, event.createdAt, event.createdAt]
        );
        await client.query(
          `
          INSERT INTO project_members (project_id, user_id, role, joined_at, left_at)
          VALUES ($1, $2, 'owner', $3, NULL)
          ON CONFLICT (project_id, user_id) DO NOTHING
          `,
          [event.projectId, event.actorUserId, event.createdAt]
        );
        break;
      }
      case "project.updated": {
        const payload = parsePayloadForEventType(event.eventType, event.payload);
        await client.query(
          `
          UPDATE projects
          SET
            name = COALESCE($2, name),
            description = COALESCE($3, description),
            status = COALESCE($4, status),
            updated_at = $5
          WHERE id = $1
          `,
          [event.projectId, payload.name ?? null, payload.description ?? null, payload.status ?? null, event.createdAt]
        );
        break;
      }
      case "member.joined": {
        const payload = parsePayloadForEventType(event.eventType, event.payload);
        await client.query(
          `
          INSERT INTO project_members (project_id, user_id, role, joined_at, left_at)
          VALUES ($1, $2, $3, $4, NULL)
          ON CONFLICT (project_id, user_id)
          DO UPDATE SET role = EXCLUDED.role, left_at = NULL
          `,
          [event.projectId, payload.userId, payload.role, event.createdAt]
        );
        break;
      }
      case "member.left": {
        const payload = parsePayloadForEventType(event.eventType, event.payload);
        await client.query(
          `
          UPDATE project_members
          SET left_at = $3
          WHERE project_id = $1
            AND user_id = $2
          `,
          [event.projectId, payload.userId, event.createdAt]
        );
        break;
      }
      case "message.posted":
      case "decision.recorded":
      case "task.created":
      case "task.completed":
      case "task.reopened":
        break;
    }

    await client.query("UPDATE projects SET updated_at = $2 WHERE id = $1", [event.projectId, event.createdAt]);
    await client.query("UPDATE project_sequences SET last_seq = GREATEST(last_seq, $2) WHERE project_id = $1", [event.projectId, seq]);
  }

  private rowToServerEvent(row: EventRow): ServerSyncEvent {
    const eventType = row.event_type;
    const payload = parsePayloadForEventType(eventType, JSON.parse(row.payload_json) as unknown);
    return serverSyncEventSchema.parse({
      id: row.id,
      projectId: row.project_id,
      seq: Number(row.seq),
      actorUserId: row.actor_user_id,
      eventType,
      entityId: row.entity_id,
      payload,
      createdAt: Number(row.created_at),
      serverCreatedAt: Number(row.server_created_at)
    });
  }
}
