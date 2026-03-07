import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { SyncRepository, type ServerUser } from "./repository.js";
import type { EventRecord } from "@slopify/shared";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ULID_1 = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const ULID_2 = "01ARZ3NDEKTSV4RRFFQ69G5FAW";
const ULID_3 = "01ARZ3NDEKTSV4RRFFQ69G5FAX";
const ULID_4 = "01ARZ3NDEKTSV4RRFFQ69G5FAY";
const ULID_5 = "01ARZ3NDEKTSV4RRFFQ69G5FAZ";
const TIMESTAMP = 1700000000000;

const createMockPool = () => ({
  query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
});

type MockPool = ReturnType<typeof createMockPool>;

const createRepo = (pool: MockPool) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  new SyncRepository(pool as any);

const testUser: ServerUser = {
  userId: ULID_1,
  displayName: "Alice",
  avatarUrl: "https://example.com/avatar.png",
};

/** Build a valid EventRecord for a given type. chatChannelId/docId are set as needed. */
function makeEvent(
  type: EventRecord["type"],
  overrides: Partial<EventRecord> & { payload: Record<string, unknown> },
): EventRecord {
  const needsChat = [
    "message.posted",
    "message.reaction.added",
    "message.reaction.removed",
    "decision.recorded",
    "task.created",
    "chat.created",
    "chat.renamed",
    "chat.deleted",
  ].includes(type);

  const needsDoc = [
    "doc.created",
    "doc.renamed",
    "doc.updated",
    "doc.comment.added",
  ].includes(type);

  return {
    id: ULID_1,
    projectId: ULID_2,
    actorUserId: ULID_3,
    type,
    payload: overrides.payload,
    chatChannelId: needsChat ? (overrides.chatChannelId ?? ULID_4) : null,
    docId: needsDoc ? (overrides.docId ?? ULID_5) : null,
    createdAt: TIMESTAMP,
    ...overrides,
  } as EventRecord;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SyncRepository", () => {
  let pool: MockPool;
  let repo: SyncRepository;

  beforeEach(() => {
    vi.restoreAllMocks();
    pool = createMockPool();
    repo = createRepo(pool);
  });

  // -----------------------------------------------------------------------
  // upsertUser
  // -----------------------------------------------------------------------
  describe("upsertUser", () => {
    it("calls pool.query with the correct INSERT ... ON CONFLICT SQL and parameters", async () => {
      const before = Date.now();
      await repo.upsertUser(testUser);
      const after = Date.now();

      expect(pool.query).toHaveBeenCalledTimes(1);
      const [sql, params] = pool.query.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain("INSERT INTO users");
      expect(sql).toContain("ON CONFLICT (user_id)");
      expect(params[0]).toBe(testUser.userId);
      expect(params[1]).toBe(testUser.displayName);
      expect(params[2]).toBe(testUser.avatarUrl);
      // The timestamp (params[3]) should be approximately now
      expect(params[3]).toBeGreaterThanOrEqual(before);
      expect(params[3]).toBeLessThanOrEqual(after);
    });

    it("works with null avatarUrl", async () => {
      await repo.upsertUser({ ...testUser, avatarUrl: null });
      const [, params] = pool.query.mock.calls[0] as [string, unknown[]];
      expect(params[2]).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // createInvite
  // -----------------------------------------------------------------------
  describe("createInvite", () => {
    it("returns a 10-character string and calls pool.query", async () => {
      const code = await repo.createInvite(ULID_2, ULID_1);
      expect(code).toHaveLength(10);
      expect(typeof code).toBe("string");
      expect(pool.query).toHaveBeenCalledTimes(1);
      const [sql, params] = pool.query.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain("INSERT INTO invites");
      expect(params[0]).toBe(code); // invite_code
      expect(params[1]).toBe(ULID_2); // project_id
      expect(params[2]).toBe(ULID_1); // created_by_user_id
      expect(typeof params[3]).toBe("number"); // created_at
    });
  });

  // -----------------------------------------------------------------------
  // joinByInvite
  // -----------------------------------------------------------------------
  describe("joinByInvite", () => {
    const inviteInput = {
      inviteCode: "ABCDE12345",
      user: testUser,
    };

    it("throws 'Invite not found' when invite does not exist", async () => {
      pool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await expect(repo.joinByInvite(inviteInput)).rejects.toThrow("Invite not found");
    });

    it("returns events without creating a new member event when user is already a member", async () => {
      // 1st call: SELECT invite → found
      pool.query.mockResolvedValueOnce({ rows: [{ project_id: ULID_2 }], rowCount: 1 });
      // 2nd call: upsertUser INSERT
      pool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      // 3rd call: SELECT existing member → found (already a member)
      pool.query.mockResolvedValueOnce({ rows: [{ project_id: ULID_2 }], rowCount: 1 });
      // 4th call: pullEvents query (returns no events)
      pool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await repo.joinByInvite(inviteInput);
      expect(result.projectId).toBe(ULID_2);
      expect(result.events).toEqual([]);
      // Should NOT have called insertEvent (no 5th query for INSERT INTO events)
      expect(pool.query).toHaveBeenCalledTimes(4);
    });

    it("creates a member.joined event and returns all events when user is a new member", async () => {
      // 1st call: SELECT invite → found
      pool.query.mockResolvedValueOnce({ rows: [{ project_id: ULID_2 }], rowCount: 1 });
      // 2nd call: upsertUser INSERT
      pool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      // 3rd call: SELECT existing member → NOT found
      pool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      // 4th call: insertEvent (INSERT INTO events) → success
      pool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      // 5th call: applyProjection → upsertProjectTimestamp
      pool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      // 6th call: applyProjection → member.joined → upsertUser
      pool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      // 7th call: applyProjection → member.joined → INSERT INTO project_members
      pool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      // 8th call: pullEvents query
      pool.query.mockResolvedValueOnce({
        rows: [
          {
            id: ULID_1,
            project_id: ULID_2,
            actor_user_id: ULID_3,
            type: "project.created",
            payload_json: { name: "Test" },
            chat_channel_id: null,
            doc_id: null,
            created_at: String(TIMESTAMP),
            server_seq: "1",
          },
        ],
        rowCount: 1,
      });

      const result = await repo.joinByInvite(inviteInput);
      expect(result.projectId).toBe(ULID_2);
      expect(result.events).toHaveLength(1);
      expect(result.events[0].type).toBe("project.created");

      // Verify insertEvent was called with a member.joined event
      const insertCall = pool.query.mock.calls[3] as [string, unknown[]];
      expect(insertCall[0]).toContain("INSERT INTO events");
      expect(insertCall[1][3]).toBe("member.joined"); // type param
    });
  });

  // -----------------------------------------------------------------------
  // listProjectIdsForUser
  // -----------------------------------------------------------------------
  describe("listProjectIdsForUser", () => {
    it("returns mapped project IDs from rows", async () => {
      pool.query.mockResolvedValueOnce({
        rows: [{ project_id: ULID_1 }, { project_id: ULID_2 }],
        rowCount: 2,
      });
      const ids = await repo.listProjectIdsForUser(ULID_3);
      expect(ids).toEqual([ULID_1, ULID_2]);
      expect(pool.query).toHaveBeenCalledWith(
        "SELECT project_id FROM project_members WHERE user_id = $1",
        [ULID_3],
      );
    });

    it("returns empty array when no rows", async () => {
      pool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const ids = await repo.listProjectIdsForUser(ULID_3);
      expect(ids).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // pullEvents
  // -----------------------------------------------------------------------
  describe("pullEvents", () => {
    it("returns empty events and same cursor when projectIds is empty", async () => {
      const result = await repo.pullEvents([], 42);
      expect(result).toEqual({ events: [], cursor: 42 });
      expect(pool.query).not.toHaveBeenCalled();
    });

    it("returns parsed events with cursor set to max server_seq", async () => {
      pool.query.mockResolvedValueOnce({
        rows: [
          {
            id: ULID_1,
            project_id: ULID_2,
            actor_user_id: ULID_3,
            type: "project.created",
            payload_json: { name: "My Project" },
            chat_channel_id: null,
            doc_id: null,
            created_at: String(TIMESTAMP),
            server_seq: "5",
          },
          {
            id: ULID_4,
            project_id: ULID_2,
            actor_user_id: ULID_3,
            type: "project.created",
            payload_json: { name: "Another" },
            chat_channel_id: null,
            doc_id: null,
            created_at: String(TIMESTAMP + 1000),
            server_seq: "10",
          },
        ],
        rowCount: 2,
      });

      const result = await repo.pullEvents([ULID_2], 0);

      expect(result.events).toHaveLength(2);
      expect(result.events[0].id).toBe(ULID_1);
      expect(result.events[0].projectId).toBe(ULID_2);
      expect(result.events[0].type).toBe("project.created");
      expect(result.events[0].createdAt).toBe(TIMESTAMP);
      expect(result.events[1].id).toBe(ULID_4);
      expect(result.cursor).toBe(10);
    });

    it("generates correct SQL placeholders for multiple project IDs", async () => {
      pool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await repo.pullEvents([ULID_1, ULID_2, ULID_3], 7);

      const [sql, params] = pool.query.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain("$2");
      expect(sql).toContain("$3");
      expect(sql).toContain("$4");
      expect(params).toEqual([7, ULID_1, ULID_2, ULID_3]);
    });

    it("returns cursor equal to since when no rows returned", async () => {
      pool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await repo.pullEvents([ULID_1], 99);
      expect(result.cursor).toBe(99);
      expect(result.events).toEqual([]);
    });

    it("handles rows where server_seq is not greater than current maxSeq (branch coverage)", async () => {
      // Return rows where the second row has a lower server_seq than the first
      // to exercise the `if (seq > maxSeq)` false branch
      pool.query.mockResolvedValueOnce({
        rows: [
          {
            id: ULID_4,
            project_id: ULID_2,
            actor_user_id: ULID_3,
            type: "project.created",
            payload_json: { name: "Higher" },
            chat_channel_id: null,
            doc_id: null,
            created_at: String(TIMESTAMP),
            server_seq: "10",
          },
          {
            id: ULID_1,
            project_id: ULID_2,
            actor_user_id: ULID_3,
            type: "project.created",
            payload_json: { name: "Lower" },
            chat_channel_id: null,
            doc_id: null,
            created_at: String(TIMESTAMP),
            server_seq: "5",
          },
        ],
        rowCount: 2,
      });

      const result = await repo.pullEvents([ULID_2], 0);
      // cursor should still be 10 (the max), not 5
      expect(result.cursor).toBe(10);
      expect(result.events).toHaveLength(2);
    });
  });

  // -----------------------------------------------------------------------
  // pushEvents
  // -----------------------------------------------------------------------
  describe("pushEvents", () => {
    it("returns empty array when given empty events", async () => {
      const result = await repo.pushEvents([]);
      expect(result).toEqual([]);
      expect(pool.query).not.toHaveBeenCalled();
    });

    it("inserts an event and returns its ID as accepted", async () => {
      const event = makeEvent("project.created", { payload: { name: "Test" } });

      // insertEvent → rowCount 1 (success)
      pool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      // applyProjection → upsertProjectTimestamp
      pool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      // applyProjection → project.created INSERT INTO projects
      pool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const accepted = await repo.pushEvents([event]);
      expect(accepted).toEqual([ULID_1]);
    });

    it("skips duplicate events (rowCount 0) and does not include them in accepted", async () => {
      const event = makeEvent("project.created", { payload: { name: "Test" } });
      // insertEvent returns rowCount 0 → duplicate, not inserted
      pool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const accepted = await repo.pushEvents([event]);
      expect(accepted).toEqual([]);
      // Only 1 call: the INSERT INTO events. No applyProjection calls.
      expect(pool.query).toHaveBeenCalledTimes(1);
    });

    it("handles null rowCount as 0 (not inserted)", async () => {
      const event = makeEvent("project.created", { payload: { name: "Test" } });
      pool.query.mockResolvedValueOnce({ rows: [], rowCount: null });

      const accepted = await repo.pushEvents([event]);
      expect(accepted).toEqual([]);
    });

    it("processes multiple events and returns only accepted IDs", async () => {
      const event1 = makeEvent("project.created", {
        id: ULID_1,
        payload: { name: "First" },
      });
      const event2 = makeEvent("project.created", {
        id: ULID_4,
        payload: { name: "Second" },
      });

      // event1: insertEvent success
      pool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      // event1: upsertProjectTimestamp
      pool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      // event1: project.created projection
      pool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      // event2: insertEvent duplicate
      pool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const accepted = await repo.pushEvents([event1, event2]);
      expect(accepted).toEqual([ULID_1]);
    });
  });

  // -----------------------------------------------------------------------
  // applyProjection (tested indirectly via pushEvents)
  // -----------------------------------------------------------------------
  describe("applyProjection (via pushEvents)", () => {
    /**
     * Helper: push a single event with insertEvent succeeding.
     * Returns all pool.query calls made AFTER the insertEvent call
     * (i.e., the upsertProjectTimestamp + projection-specific calls).
     */
    async function pushAndGetProjectionCalls(event: EventRecord) {
      // insertEvent → success
      pool.query.mockResolvedValue({ rows: [], rowCount: 1 });

      await repo.pushEvents([event]);

      // calls[0] = insertEvent, calls[1..] = projection calls
      return pool.query.mock.calls.slice(1) as Array<[string, unknown[]]>;
    }

    // -- project.created --------------------------------------------------
    it("project.created: inserts into projects table", async () => {
      const event = makeEvent("project.created", { payload: { name: "My Project" } });
      const calls = await pushAndGetProjectionCalls(event);

      // call 0 = upsertProjectTimestamp, call 1 = project.created projection
      expect(calls).toHaveLength(2);
      expect(calls[0][0]).toContain("INSERT INTO projects");
      expect(calls[0][0]).toContain("COALESCE");
      expect(calls[0][1]).toEqual([ULID_2, TIMESTAMP]);

      expect(calls[1][0]).toContain("INSERT INTO projects");
      expect(calls[1][0]).toContain("ON CONFLICT (project_id)");
      expect(calls[1][1]).toEqual([ULID_2, "My Project", TIMESTAMP]);
    });

    // -- member.joined ----------------------------------------------------
    it("member.joined: upserts user and inserts into project_members", async () => {
      const event = makeEvent("member.joined", {
        payload: {
          memberUserId: ULID_3,
          memberDisplayName: "Bob",
          memberAvatarUrl: null,
        },
      });
      const calls = await pushAndGetProjectionCalls(event);

      // call 0 = upsertProjectTimestamp
      // call 1 = upsertUser (member.joined handler)
      // call 2 = INSERT INTO project_members
      expect(calls).toHaveLength(3);

      expect(calls[1][0]).toContain("INSERT INTO users");
      expect(calls[1][1]![0]).toBe(ULID_3); // memberUserId
      expect(calls[1][1]![1]).toBe("Bob"); // memberDisplayName

      expect(calls[2][0]).toContain("INSERT INTO project_members");
      expect(calls[2][1]).toEqual([ULID_2, ULID_3, TIMESTAMP]);
    });

    // -- chat.created -----------------------------------------------------
    it("chat.created: inserts into chat_channels", async () => {
      const event = makeEvent("chat.created", {
        chatChannelId: ULID_4,
        payload: { chatChannelId: ULID_4, name: "General" },
      });
      const calls = await pushAndGetProjectionCalls(event);

      // call 0 = upsertProjectTimestamp, call 1 = chat_channels insert
      expect(calls).toHaveLength(2);
      expect(calls[1][0]).toContain("INSERT INTO chat_channels");
      expect(calls[1][1]).toEqual([ULID_4, ULID_2, "General", TIMESTAMP]);
    });

    // -- chat.renamed -----------------------------------------------------
    it("chat.renamed: updates chat_channels name", async () => {
      const event = makeEvent("chat.renamed", {
        chatChannelId: ULID_4,
        payload: { chatChannelId: ULID_4, name: "Renamed" },
      });
      const calls = await pushAndGetProjectionCalls(event);

      expect(calls).toHaveLength(2);
      expect(calls[1][0]).toContain("UPDATE chat_channels SET name");
      expect(calls[1][1]).toEqual(["Renamed", TIMESTAMP, ULID_4]);
    });

    // -- chat.deleted -----------------------------------------------------
    it("chat.deleted: deletes from chat_channels", async () => {
      const event = makeEvent("chat.deleted", {
        chatChannelId: ULID_4,
        payload: { chatChannelId: ULID_4 },
      });
      const calls = await pushAndGetProjectionCalls(event);

      expect(calls).toHaveLength(2);
      expect(calls[1][0]).toContain("DELETE FROM chat_channels");
      expect(calls[1][1]).toEqual([ULID_4]);
    });

    // -- decision.recorded ------------------------------------------------
    it("decision.recorded: inserts into decisions", async () => {
      const event = makeEvent("decision.recorded", {
        chatChannelId: ULID_4,
        payload: {
          chatChannelId: ULID_4,
          title: "Decision Title",
          body: "Decision body text",
        },
      });
      const calls = await pushAndGetProjectionCalls(event);

      expect(calls).toHaveLength(2);
      expect(calls[1][0]).toContain("INSERT INTO decisions");
      expect(calls[1][1]).toEqual([
        ULID_1, // event.id used as decision_id
        ULID_2, // project_id
        ULID_4, // chat_channel_id
        "Decision Title",
        "Decision body text",
        TIMESTAMP,
      ]);
    });

    // -- task.created -----------------------------------------------------
    it("task.created: inserts into tasks", async () => {
      const taskId = ULID_5;
      const event = makeEvent("task.created", {
        chatChannelId: ULID_4,
        payload: {
          taskId,
          chatChannelId: ULID_4,
          title: "My Task",
        },
      });
      const calls = await pushAndGetProjectionCalls(event);

      expect(calls).toHaveLength(2);
      expect(calls[1][0]).toContain("INSERT INTO tasks");
      expect(calls[1][1]).toEqual([taskId, ULID_2, ULID_4, "My Task", TIMESTAMP]);
    });

    // -- task.completed ---------------------------------------------------
    it("task.completed: updates tasks SET completed = TRUE", async () => {
      const taskId = ULID_5;
      const event = makeEvent("task.completed", {
        chatChannelId: ULID_4,
        payload: { taskId },
      });
      const calls = await pushAndGetProjectionCalls(event);

      expect(calls).toHaveLength(2);
      expect(calls[1][0]).toContain("UPDATE tasks SET completed = TRUE");
      expect(calls[1][1]).toEqual([TIMESTAMP, taskId]);
    });

    // -- task.reopened ----------------------------------------------------
    it("task.reopened: updates tasks SET completed = FALSE", async () => {
      const taskId = ULID_5;
      const event = makeEvent("task.reopened", {
        chatChannelId: ULID_4,
        payload: { taskId },
      });
      const calls = await pushAndGetProjectionCalls(event);

      expect(calls).toHaveLength(2);
      expect(calls[1][0]).toContain("UPDATE tasks SET completed = FALSE");
      expect(calls[1][1]).toEqual([TIMESTAMP, taskId]);
    });

    // -- doc.created ------------------------------------------------------
    it("doc.created: inserts into docs", async () => {
      const event = makeEvent("doc.created", {
        docId: ULID_5,
        payload: {
          docId: ULID_5,
          title: "Doc Title",
          markdown: "# Hello",
        },
      });
      const calls = await pushAndGetProjectionCalls(event);

      expect(calls).toHaveLength(2);
      expect(calls[1][0]).toContain("INSERT INTO docs");
      expect(calls[1][1]).toEqual([ULID_5, ULID_2, "Doc Title", "# Hello", TIMESTAMP]);
    });

    // -- doc.renamed ------------------------------------------------------
    it("doc.renamed: updates docs SET title", async () => {
      const event = makeEvent("doc.renamed", {
        docId: ULID_5,
        payload: { docId: ULID_5, title: "New Title" },
      });
      const calls = await pushAndGetProjectionCalls(event);

      expect(calls).toHaveLength(2);
      expect(calls[1][0]).toContain("UPDATE docs SET title");
      expect(calls[1][1]).toEqual(["New Title", TIMESTAMP, ULID_5]);
    });

    // -- doc.updated ------------------------------------------------------
    it("doc.updated: updates docs SET markdown", async () => {
      const event = makeEvent("doc.updated", {
        docId: ULID_5,
        payload: { docId: ULID_5, markdown: "## Updated" },
      });
      const calls = await pushAndGetProjectionCalls(event);

      expect(calls).toHaveLength(2);
      expect(calls[1][0]).toContain("UPDATE docs SET markdown");
      expect(calls[1][1]).toEqual(["## Updated", TIMESTAMP, ULID_5]);
    });

    // -- doc.comment.added ------------------------------------------------
    it("doc.comment.added: inserts into doc_comments", async () => {
      const commentId = ULID_4;
      const event = makeEvent("doc.comment.added", {
        docId: ULID_5,
        payload: {
          docId: ULID_5,
          commentId,
          body: "Nice work",
          anchor: "line-42",
        },
      });
      const calls = await pushAndGetProjectionCalls(event);

      expect(calls).toHaveLength(2);
      expect(calls[1][0]).toContain("INSERT INTO doc_comments");
      expect(calls[1][1]).toEqual([
        commentId,
        ULID_2, // project_id
        ULID_5, // doc_id
        ULID_3, // actor_user_id
        "Nice work",
        "line-42",
        TIMESTAMP,
      ]);
    });

    it("doc.comment.added: handles null anchor", async () => {
      const commentId = ULID_4;
      const event = makeEvent("doc.comment.added", {
        docId: ULID_5,
        payload: {
          docId: ULID_5,
          commentId,
          body: "General comment",
          anchor: null,
        },
      });
      const calls = await pushAndGetProjectionCalls(event);

      expect(calls[1][1]![5]).toBeNull(); // anchor param
    });

    // -- message.posted (no-op) -------------------------------------------
    it("message.posted: only calls upsertProjectTimestamp (no extra SQL)", async () => {
      const event = makeEvent("message.posted", {
        chatChannelId: ULID_4,
        payload: {
          chatChannelId: ULID_4,
          body: "Hello world",
        },
      });
      const calls = await pushAndGetProjectionCalls(event);

      // Only upsertProjectTimestamp, no other projection SQL
      expect(calls).toHaveLength(1);
      expect(calls[0][0]).toContain("INSERT INTO projects");
      expect(calls[0][0]).toContain("COALESCE");
    });

    // -- message.reaction.added (no-op) -----------------------------------
    it("message.reaction.added: only calls upsertProjectTimestamp", async () => {
      const event = makeEvent("message.reaction.added", {
        chatChannelId: ULID_4,
        payload: {
          chatChannelId: ULID_4,
          messageEventId: ULID_5,
          emoji: "thumbsup",
        },
      });
      const calls = await pushAndGetProjectionCalls(event);
      expect(calls).toHaveLength(1);
    });

    // -- message.reaction.removed (no-op) ---------------------------------
    it("message.reaction.removed: only calls upsertProjectTimestamp", async () => {
      const event = makeEvent("message.reaction.removed", {
        chatChannelId: ULID_4,
        payload: {
          chatChannelId: ULID_4,
          messageEventId: ULID_5,
          emoji: "thumbsup",
        },
      });
      const calls = await pushAndGetProjectionCalls(event);
      expect(calls).toHaveLength(1);
    });
  });

  // -----------------------------------------------------------------------
  // upsertProjectTimestamp (tested indirectly — always called by applyProjection)
  // -----------------------------------------------------------------------
  describe("upsertProjectTimestamp (via pushEvents)", () => {
    it("is called with projectId and createdAt for every pushed event", async () => {
      const event = makeEvent("project.created", { payload: { name: "Test" } });
      pool.query.mockResolvedValue({ rows: [], rowCount: 1 });

      await repo.pushEvents([event]);

      // calls[0] = insertEvent, calls[1] = upsertProjectTimestamp
      const tsCall = pool.query.mock.calls[1] as [string, unknown[]];
      expect(tsCall[0]).toContain("INSERT INTO projects");
      expect(tsCall[0]).toContain("GREATEST(projects.updated_at, EXCLUDED.updated_at)");
      expect(tsCall[1]).toEqual([ULID_2, TIMESTAMP]);
    });
  });

  // -----------------------------------------------------------------------
  // insertEvent (tested indirectly via pushEvents)
  // -----------------------------------------------------------------------
  describe("insertEvent (via pushEvents)", () => {
    it("passes all event fields as parameters to the INSERT", async () => {
      const event = makeEvent("project.created", { payload: { name: "X" } });
      pool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      // upsertProjectTimestamp
      pool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      // project.created projection
      pool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      await repo.pushEvents([event]);

      const [sql, params] = pool.query.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain("INSERT INTO events");
      expect(sql).toContain("ON CONFLICT (id) DO NOTHING");
      expect(params[0]).toBe(event.id);
      expect(params[1]).toBe(event.projectId);
      expect(params[2]).toBe(event.actorUserId);
      expect(params[3]).toBe(event.type);
      expect(params[4]).toBe(JSON.stringify(event.payload));
      expect(params[5]).toBe(event.chatChannelId);
      expect(params[6]).toBe(event.docId);
      expect(params[7]).toBe(event.createdAt);
    });
  });
});
