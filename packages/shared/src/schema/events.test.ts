import { describe, it, expect } from "vitest";
import {
  eventTypeSchema,
  projectCreatedPayloadSchema,
  memberJoinedPayloadSchema,
  chatCreatedPayloadSchema,
  chatRenamedPayloadSchema,
  chatDeletedPayloadSchema,
  messagePostedPayloadSchema,
  messageEditedPayloadSchema,
  messageDeletedPayloadSchema,
  messageReactionAddedPayloadSchema,
  messageReactionRemovedPayloadSchema,
  decisionRecordedPayloadSchema,
  taskCreatedPayloadSchema,
  taskCompletedPayloadSchema,
  taskReopenedPayloadSchema,
  docCreatedPayloadSchema,
  docRenamedPayloadSchema,
  docUpdatedPayloadSchema,
  docCommentAddedPayloadSchema,
  eventPayloadSchema,
  eventSchema,
  timelineDisplaySchema,
} from "./events.js";

const ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const ID2 = "01BRZ3NDEKTSV4RRFFQ69G5FAV";
const TS = 1700000000000;

// ─── eventTypeSchema ──────────────────────────────────────────

describe("eventTypeSchema", () => {
  const validTypes = [
    "project.created",
    "member.joined",
    "chat.created",
    "chat.renamed",
    "chat.deleted",
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
  ] as const;

  it.each(validTypes)("accepts valid type: %s", (type) => {
    expect(eventTypeSchema.parse(type)).toBe(type);
  });

  it("rejects invalid type", () => {
    const result = eventTypeSchema.safeParse("invalid.type");
    expect(result.success).toBe(false);
  });

  it("rejects empty string", () => {
    const result = eventTypeSchema.safeParse("");
    expect(result.success).toBe(false);
  });

  it("rejects non-string input", () => {
    const result = eventTypeSchema.safeParse(42);
    expect(result.success).toBe(false);
  });
});

// ─── Payload schemas ───────────────────────────────────────────

describe("projectCreatedPayloadSchema", () => {
  it("accepts valid payload", () => {
    const data = { name: "My Project" };
    expect(projectCreatedPayloadSchema.parse(data)).toEqual({ name: "My Project" });
  });

  it("rejects missing name", () => {
    const result = projectCreatedPayloadSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects empty name", () => {
    const result = projectCreatedPayloadSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });

  it("trims name", () => {
    expect(projectCreatedPayloadSchema.parse({ name: "  My Project  " })).toEqual({
      name: "My Project",
    });
  });
});

describe("memberJoinedPayloadSchema", () => {
  it("accepts valid payload with avatar", () => {
    const data = {
      memberUserId: ID,
      memberDisplayName: "Alice",
      memberAvatarUrl: "https://example.com/avatar.png",
    };
    expect(memberJoinedPayloadSchema.parse(data)).toEqual(data);
  });

  it("accepts valid payload with null avatar", () => {
    const data = {
      memberUserId: ID,
      memberDisplayName: "Alice",
      memberAvatarUrl: null,
    };
    expect(memberJoinedPayloadSchema.parse(data)).toEqual(data);
  });

  it("rejects missing memberUserId", () => {
    const result = memberJoinedPayloadSchema.safeParse({
      memberDisplayName: "Alice",
      memberAvatarUrl: null,
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing memberDisplayName", () => {
    const result = memberJoinedPayloadSchema.safeParse({
      memberUserId: ID,
      memberAvatarUrl: null,
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid ULID for memberUserId", () => {
    const result = memberJoinedPayloadSchema.safeParse({
      memberUserId: "invalid",
      memberDisplayName: "Alice",
      memberAvatarUrl: null,
    });
    expect(result.success).toBe(false);
  });
});

describe("chatCreatedPayloadSchema", () => {
  it("accepts valid payload", () => {
    const data = { chatChannelId: ID, name: "General" };
    expect(chatCreatedPayloadSchema.parse(data)).toEqual({ chatChannelId: ID, name: "General" });
  });

  it("rejects missing chatChannelId", () => {
    const result = chatCreatedPayloadSchema.safeParse({ name: "General" });
    expect(result.success).toBe(false);
  });

  it("rejects missing name", () => {
    const result = chatCreatedPayloadSchema.safeParse({ chatChannelId: ID });
    expect(result.success).toBe(false);
  });
});

describe("chatRenamedPayloadSchema", () => {
  it("accepts valid payload", () => {
    const data = { chatChannelId: ID, name: "Renamed" };
    expect(chatRenamedPayloadSchema.parse(data)).toEqual(data);
  });

  it("rejects missing fields", () => {
    expect(chatRenamedPayloadSchema.safeParse({}).success).toBe(false);
    expect(chatRenamedPayloadSchema.safeParse({ chatChannelId: ID }).success).toBe(false);
    expect(chatRenamedPayloadSchema.safeParse({ name: "Renamed" }).success).toBe(false);
  });
});

describe("chatDeletedPayloadSchema", () => {
  it("accepts valid payload", () => {
    const data = { chatChannelId: ID };
    expect(chatDeletedPayloadSchema.parse(data)).toEqual(data);
  });

  it("rejects missing chatChannelId", () => {
    expect(chatDeletedPayloadSchema.safeParse({}).success).toBe(false);
  });

  it("rejects invalid ULID", () => {
    expect(chatDeletedPayloadSchema.safeParse({ chatChannelId: "bad" }).success).toBe(false);
  });
});

describe("messagePostedPayloadSchema", () => {
  it("accepts valid payload with required fields only", () => {
    const data = { chatChannelId: ID, body: "Hello world" };
    const result = messagePostedPayloadSchema.parse(data);
    expect(result.chatChannelId).toBe(ID);
    expect(result.body).toBe("Hello world");
  });

  it("accepts valid payload with all optional fields", () => {
    const data = {
      chatChannelId: ID,
      body: "Hello",
      imageDataUrl: "data:image/png;base64,abc",
      replyToEventId: ID2,
    };
    const result = messagePostedPayloadSchema.parse(data);
    expect(result.imageDataUrl).toBe("data:image/png;base64,abc");
    expect(result.replyToEventId).toBe(ID2);
  });

  it("accepts empty body", () => {
    // body is z.string() without min(1), so empty is valid
    const data = { chatChannelId: ID, body: "" };
    const result = messagePostedPayloadSchema.parse(data);
    expect(result.body).toBe("");
  });

  it("rejects missing chatChannelId", () => {
    expect(messagePostedPayloadSchema.safeParse({ body: "hi" }).success).toBe(false);
  });

  it("rejects missing body", () => {
    expect(messagePostedPayloadSchema.safeParse({ chatChannelId: ID }).success).toBe(false);
  });

  it("rejects invalid replyToEventId", () => {
    const result = messagePostedPayloadSchema.safeParse({
      chatChannelId: ID,
      body: "hi",
      replyToEventId: "bad-id",
    });
    expect(result.success).toBe(false);
  });
});

describe("messageEditedPayloadSchema", () => {
  it("accepts valid payload", () => {
    const data = { chatChannelId: ID, messageEventId: ID2, body: "edited" };
    expect(messageEditedPayloadSchema.parse(data)).toEqual(data);
  });

  it("rejects missing messageEventId", () => {
    expect(
      messageEditedPayloadSchema.safeParse({ chatChannelId: ID, body: "edited" }).success
    ).toBe(false);
  });

  it("rejects missing body", () => {
    expect(
      messageEditedPayloadSchema.safeParse({ chatChannelId: ID, messageEventId: ID2 }).success
    ).toBe(false);
  });
});

describe("messageDeletedPayloadSchema", () => {
  it("accepts valid payload", () => {
    const data = { chatChannelId: ID, messageEventId: ID2 };
    expect(messageDeletedPayloadSchema.parse(data)).toEqual(data);
  });

  it("rejects missing messageEventId", () => {
    expect(messageDeletedPayloadSchema.safeParse({ chatChannelId: ID }).success).toBe(false);
  });
});

describe("messageReactionAddedPayloadSchema", () => {
  it("accepts valid payload", () => {
    const data = { chatChannelId: ID, messageEventId: ID2, emoji: "👍" };
    expect(messageReactionAddedPayloadSchema.parse(data)).toEqual(data);
  });

  it("rejects missing emoji", () => {
    expect(
      messageReactionAddedPayloadSchema.safeParse({ chatChannelId: ID, messageEventId: ID2 })
        .success
    ).toBe(false);
  });

  it("rejects missing chatChannelId", () => {
    expect(
      messageReactionAddedPayloadSchema.safeParse({ messageEventId: ID2, emoji: "👍" }).success
    ).toBe(false);
  });

  it("rejects missing messageEventId", () => {
    expect(
      messageReactionAddedPayloadSchema.safeParse({ chatChannelId: ID, emoji: "👍" }).success
    ).toBe(false);
  });
});

describe("messageReactionRemovedPayloadSchema", () => {
  it("accepts valid payload", () => {
    const data = { chatChannelId: ID, messageEventId: ID2, emoji: "👎" };
    expect(messageReactionRemovedPayloadSchema.parse(data)).toEqual(data);
  });

  it("rejects missing fields", () => {
    expect(messageReactionRemovedPayloadSchema.safeParse({}).success).toBe(false);
  });
});

describe("decisionRecordedPayloadSchema", () => {
  it("accepts valid payload", () => {
    const data = { chatChannelId: ID, title: "Decision 1", body: "We decided to..." };
    expect(decisionRecordedPayloadSchema.parse(data)).toEqual(data);
  });

  it("rejects empty title", () => {
    expect(
      decisionRecordedPayloadSchema.safeParse({
        chatChannelId: ID,
        title: "",
        body: "content",
      }).success
    ).toBe(false);
  });

  it("rejects empty body", () => {
    expect(
      decisionRecordedPayloadSchema.safeParse({
        chatChannelId: ID,
        title: "Title",
        body: "",
      }).success
    ).toBe(false);
  });

  it("rejects missing chatChannelId", () => {
    expect(
      decisionRecordedPayloadSchema.safeParse({ title: "Title", body: "Body" }).success
    ).toBe(false);
  });
});

describe("taskCreatedPayloadSchema", () => {
  it("accepts valid payload", () => {
    const data = { taskId: ID, chatChannelId: ID2, title: "Fix bug" };
    expect(taskCreatedPayloadSchema.parse(data)).toEqual(data);
  });

  it("rejects missing taskId", () => {
    expect(
      taskCreatedPayloadSchema.safeParse({ chatChannelId: ID2, title: "Fix bug" }).success
    ).toBe(false);
  });

  it("rejects missing title", () => {
    expect(
      taskCreatedPayloadSchema.safeParse({ taskId: ID, chatChannelId: ID2 }).success
    ).toBe(false);
  });
});

describe("taskCompletedPayloadSchema", () => {
  it("accepts valid payload", () => {
    const data = { taskId: ID };
    expect(taskCompletedPayloadSchema.parse(data)).toEqual(data);
  });

  it("rejects missing taskId", () => {
    expect(taskCompletedPayloadSchema.safeParse({}).success).toBe(false);
  });

  it("rejects invalid ULID", () => {
    expect(taskCompletedPayloadSchema.safeParse({ taskId: "bad" }).success).toBe(false);
  });
});

describe("taskReopenedPayloadSchema", () => {
  it("accepts valid payload", () => {
    const data = { taskId: ID };
    expect(taskReopenedPayloadSchema.parse(data)).toEqual(data);
  });

  it("rejects missing taskId", () => {
    expect(taskReopenedPayloadSchema.safeParse({}).success).toBe(false);
  });
});

describe("docCreatedPayloadSchema", () => {
  it("accepts valid payload", () => {
    const data = { docId: ID, title: "My Doc", markdown: "# Hello" };
    expect(docCreatedPayloadSchema.parse(data)).toEqual(data);
  });

  it("accepts empty markdown", () => {
    const data = { docId: ID, title: "My Doc", markdown: "" };
    expect(docCreatedPayloadSchema.parse(data)).toEqual(data);
  });

  it("rejects missing docId", () => {
    expect(
      docCreatedPayloadSchema.safeParse({ title: "My Doc", markdown: "" }).success
    ).toBe(false);
  });

  it("rejects missing title", () => {
    expect(
      docCreatedPayloadSchema.safeParse({ docId: ID, markdown: "" }).success
    ).toBe(false);
  });

  it("rejects missing markdown", () => {
    expect(
      docCreatedPayloadSchema.safeParse({ docId: ID, title: "My Doc" }).success
    ).toBe(false);
  });
});

describe("docRenamedPayloadSchema", () => {
  it("accepts valid payload", () => {
    const data = { docId: ID, title: "Renamed Doc" };
    expect(docRenamedPayloadSchema.parse(data)).toEqual(data);
  });

  it("rejects missing title", () => {
    expect(docRenamedPayloadSchema.safeParse({ docId: ID }).success).toBe(false);
  });

  it("rejects empty title", () => {
    expect(docRenamedPayloadSchema.safeParse({ docId: ID, title: "" }).success).toBe(false);
  });
});

describe("docUpdatedPayloadSchema", () => {
  it("accepts valid payload", () => {
    const data = { docId: ID, markdown: "# Updated" };
    expect(docUpdatedPayloadSchema.parse(data)).toEqual(data);
  });

  it("accepts empty markdown", () => {
    const data = { docId: ID, markdown: "" };
    expect(docUpdatedPayloadSchema.parse(data)).toEqual(data);
  });

  it("rejects missing docId", () => {
    expect(docUpdatedPayloadSchema.safeParse({ markdown: "# Updated" }).success).toBe(false);
  });

  it("rejects missing markdown", () => {
    expect(docUpdatedPayloadSchema.safeParse({ docId: ID }).success).toBe(false);
  });
});

describe("docCommentAddedPayloadSchema", () => {
  it("accepts valid payload with anchor", () => {
    const data = { docId: ID, commentId: ID2, body: "Nice doc!", anchor: "section-1" };
    expect(docCommentAddedPayloadSchema.parse(data)).toEqual(data);
  });

  it("accepts valid payload with null anchor", () => {
    const data = { docId: ID, commentId: ID2, body: "Nice doc!", anchor: null };
    expect(docCommentAddedPayloadSchema.parse(data)).toEqual(data);
  });

  it("rejects missing body", () => {
    expect(
      docCommentAddedPayloadSchema.safeParse({ docId: ID, commentId: ID2, anchor: null }).success
    ).toBe(false);
  });

  it("rejects empty body", () => {
    expect(
      docCommentAddedPayloadSchema.safeParse({
        docId: ID,
        commentId: ID2,
        body: "",
        anchor: null,
      }).success
    ).toBe(false);
  });

  it("rejects missing commentId", () => {
    expect(
      docCommentAddedPayloadSchema.safeParse({ docId: ID, body: "comment", anchor: null }).success
    ).toBe(false);
  });
});

// ─── eventPayloadSchema (discriminated union) ──────────────────

describe("eventPayloadSchema", () => {
  it("accepts project.created variant", () => {
    const data = { type: "project.created", payload: { name: "Project" } };
    const result = eventPayloadSchema.parse(data);
    expect(result.type).toBe("project.created");
  });

  it("accepts member.joined variant", () => {
    const data = {
      type: "member.joined",
      payload: { memberUserId: ID, memberDisplayName: "Bob", memberAvatarUrl: null },
    };
    const result = eventPayloadSchema.parse(data);
    expect(result.type).toBe("member.joined");
  });

  it("accepts chat.created variant", () => {
    const data = { type: "chat.created", payload: { chatChannelId: ID, name: "General" } };
    expect(eventPayloadSchema.parse(data).type).toBe("chat.created");
  });

  it("accepts chat.renamed variant", () => {
    const data = { type: "chat.renamed", payload: { chatChannelId: ID, name: "Renamed" } };
    expect(eventPayloadSchema.parse(data).type).toBe("chat.renamed");
  });

  it("accepts chat.deleted variant", () => {
    const data = { type: "chat.deleted", payload: { chatChannelId: ID } };
    expect(eventPayloadSchema.parse(data).type).toBe("chat.deleted");
  });

  it("accepts message.posted variant", () => {
    const data = { type: "message.posted", payload: { chatChannelId: ID, body: "hi" } };
    expect(eventPayloadSchema.parse(data).type).toBe("message.posted");
  });

  it("accepts message.edited variant", () => {
    const data = {
      type: "message.edited",
      payload: { chatChannelId: ID, messageEventId: ID2, body: "edited" },
    };
    expect(eventPayloadSchema.parse(data).type).toBe("message.edited");
  });

  it("accepts message.deleted variant", () => {
    const data = {
      type: "message.deleted",
      payload: { chatChannelId: ID, messageEventId: ID2 },
    };
    expect(eventPayloadSchema.parse(data).type).toBe("message.deleted");
  });

  it("accepts message.reaction.added variant", () => {
    const data = {
      type: "message.reaction.added",
      payload: { chatChannelId: ID, messageEventId: ID2, emoji: "👍" },
    };
    expect(eventPayloadSchema.parse(data).type).toBe("message.reaction.added");
  });

  it("accepts message.reaction.removed variant", () => {
    const data = {
      type: "message.reaction.removed",
      payload: { chatChannelId: ID, messageEventId: ID2, emoji: "👎" },
    };
    expect(eventPayloadSchema.parse(data).type).toBe("message.reaction.removed");
  });

  it("accepts decision.recorded variant", () => {
    const data = {
      type: "decision.recorded",
      payload: { chatChannelId: ID, title: "D1", body: "Decided" },
    };
    expect(eventPayloadSchema.parse(data).type).toBe("decision.recorded");
  });

  it("accepts task.created variant", () => {
    const data = {
      type: "task.created",
      payload: { taskId: ID, chatChannelId: ID2, title: "Task 1" },
    };
    expect(eventPayloadSchema.parse(data).type).toBe("task.created");
  });

  it("accepts task.completed variant", () => {
    const data = { type: "task.completed", payload: { taskId: ID } };
    expect(eventPayloadSchema.parse(data).type).toBe("task.completed");
  });

  it("accepts task.reopened variant", () => {
    const data = { type: "task.reopened", payload: { taskId: ID } };
    expect(eventPayloadSchema.parse(data).type).toBe("task.reopened");
  });

  it("accepts doc.created variant", () => {
    const data = {
      type: "doc.created",
      payload: { docId: ID, title: "Doc 1", markdown: "# Doc" },
    };
    expect(eventPayloadSchema.parse(data).type).toBe("doc.created");
  });

  it("accepts doc.renamed variant", () => {
    const data = { type: "doc.renamed", payload: { docId: ID, title: "Renamed" } };
    expect(eventPayloadSchema.parse(data).type).toBe("doc.renamed");
  });

  it("accepts doc.updated variant", () => {
    const data = { type: "doc.updated", payload: { docId: ID, markdown: "# Updated" } };
    expect(eventPayloadSchema.parse(data).type).toBe("doc.updated");
  });

  it("accepts doc.comment.added variant", () => {
    const data = {
      type: "doc.comment.added",
      payload: { docId: ID, commentId: ID2, body: "Comment", anchor: null },
    };
    expect(eventPayloadSchema.parse(data).type).toBe("doc.comment.added");
  });

  it("rejects invalid type", () => {
    const result = eventPayloadSchema.safeParse({
      type: "invalid.type",
      payload: { name: "X" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects mismatched type and payload", () => {
    const result = eventPayloadSchema.safeParse({
      type: "project.created",
      payload: { taskId: ID },
    });
    expect(result.success).toBe(false);
  });
});

// ─── eventSchema with superRefine ─────────────────────────────

describe("eventSchema", () => {
  const baseEvent = {
    id: ID,
    projectId: ID,
    actorUserId: ID,
    createdAt: TS,
  };

  it("accepts a valid project.created event", () => {
    const event = {
      ...baseEvent,
      type: "project.created",
      payload: { name: "My Project" },
      chatChannelId: null,
      docId: null,
    };
    expect(eventSchema.parse(event)).toBeTruthy();
  });

  it("accepts a valid member.joined event", () => {
    const event = {
      ...baseEvent,
      type: "member.joined",
      payload: { memberUserId: ID, memberDisplayName: "Alice", memberAvatarUrl: null },
      chatChannelId: null,
      docId: null,
    };
    expect(eventSchema.parse(event)).toBeTruthy();
  });

  it("accepts a valid message.posted event with chatChannelId", () => {
    const event = {
      ...baseEvent,
      type: "message.posted",
      payload: { chatChannelId: ID2, body: "Hello" },
      chatChannelId: ID2,
      docId: null,
    };
    expect(eventSchema.parse(event)).toBeTruthy();
  });

  it("rejects message.posted event with null chatChannelId", () => {
    const event = {
      ...baseEvent,
      type: "message.posted",
      payload: { chatChannelId: ID2, body: "Hello" },
      chatChannelId: null,
      docId: null,
    };
    const result = eventSchema.safeParse(event);
    expect(result.success).toBe(false);
  });

  it("rejects message.edited event with null chatChannelId", () => {
    const event = {
      ...baseEvent,
      type: "message.edited",
      payload: { chatChannelId: ID, messageEventId: ID2, body: "edited" },
      chatChannelId: null,
      docId: null,
    };
    const result = eventSchema.safeParse(event);
    expect(result.success).toBe(false);
  });

  it("rejects message.deleted event with null chatChannelId", () => {
    const event = {
      ...baseEvent,
      type: "message.deleted",
      payload: { chatChannelId: ID, messageEventId: ID2 },
      chatChannelId: null,
      docId: null,
    };
    const result = eventSchema.safeParse(event);
    expect(result.success).toBe(false);
  });

  it("rejects message.reaction.added event with null chatChannelId", () => {
    const event = {
      ...baseEvent,
      type: "message.reaction.added",
      payload: { chatChannelId: ID, messageEventId: ID2, emoji: "👍" },
      chatChannelId: null,
      docId: null,
    };
    const result = eventSchema.safeParse(event);
    expect(result.success).toBe(false);
  });

  it("rejects message.reaction.removed event with null chatChannelId", () => {
    const event = {
      ...baseEvent,
      type: "message.reaction.removed",
      payload: { chatChannelId: ID, messageEventId: ID2, emoji: "👎" },
      chatChannelId: null,
      docId: null,
    };
    const result = eventSchema.safeParse(event);
    expect(result.success).toBe(false);
  });

  it("rejects decision.recorded event with null chatChannelId", () => {
    const event = {
      ...baseEvent,
      type: "decision.recorded",
      payload: { chatChannelId: ID, title: "D1", body: "decided" },
      chatChannelId: null,
      docId: null,
    };
    const result = eventSchema.safeParse(event);
    expect(result.success).toBe(false);
  });

  it("rejects task.created event with null chatChannelId", () => {
    const event = {
      ...baseEvent,
      type: "task.created",
      payload: { taskId: ID, chatChannelId: ID2, title: "Task" },
      chatChannelId: null,
      docId: null,
    };
    const result = eventSchema.safeParse(event);
    expect(result.success).toBe(false);
  });

  it("accepts a valid decision.recorded event with chatChannelId", () => {
    const event = {
      ...baseEvent,
      type: "decision.recorded",
      payload: { chatChannelId: ID, title: "D1", body: "decided" },
      chatChannelId: ID,
      docId: null,
    };
    expect(eventSchema.parse(event)).toBeTruthy();
  });

  it("accepts a valid task.created event with chatChannelId", () => {
    const event = {
      ...baseEvent,
      type: "task.created",
      payload: { taskId: ID2, chatChannelId: ID, title: "Task" },
      chatChannelId: ID,
      docId: null,
    };
    expect(eventSchema.parse(event)).toBeTruthy();
  });

  it("accepts a valid doc.created event with docId", () => {
    const event = {
      ...baseEvent,
      type: "doc.created",
      payload: { docId: ID2, title: "Doc", markdown: "" },
      chatChannelId: null,
      docId: ID2,
    };
    expect(eventSchema.parse(event)).toBeTruthy();
  });

  it("rejects doc.created event with null docId", () => {
    const event = {
      ...baseEvent,
      type: "doc.created",
      payload: { docId: ID2, title: "Doc", markdown: "" },
      chatChannelId: null,
      docId: null,
    };
    const result = eventSchema.safeParse(event);
    expect(result.success).toBe(false);
  });

  it("rejects doc.renamed event with null docId", () => {
    const event = {
      ...baseEvent,
      type: "doc.renamed",
      payload: { docId: ID, title: "Renamed" },
      chatChannelId: null,
      docId: null,
    };
    const result = eventSchema.safeParse(event);
    expect(result.success).toBe(false);
  });

  it("rejects doc.updated event with null docId", () => {
    const event = {
      ...baseEvent,
      type: "doc.updated",
      payload: { docId: ID, markdown: "# Updated" },
      chatChannelId: null,
      docId: null,
    };
    const result = eventSchema.safeParse(event);
    expect(result.success).toBe(false);
  });

  it("rejects doc.comment.added event with null docId", () => {
    const event = {
      ...baseEvent,
      type: "doc.comment.added",
      payload: { docId: ID, commentId: ID2, body: "Comment", anchor: null },
      chatChannelId: null,
      docId: null,
    };
    const result = eventSchema.safeParse(event);
    expect(result.success).toBe(false);
  });

  it("accepts doc.renamed event with docId", () => {
    const event = {
      ...baseEvent,
      type: "doc.renamed",
      payload: { docId: ID, title: "Renamed" },
      chatChannelId: null,
      docId: ID,
    };
    expect(eventSchema.parse(event)).toBeTruthy();
  });

  it("accepts doc.updated event with docId", () => {
    const event = {
      ...baseEvent,
      type: "doc.updated",
      payload: { docId: ID, markdown: "# Updated" },
      chatChannelId: null,
      docId: ID,
    };
    expect(eventSchema.parse(event)).toBeTruthy();
  });

  it("accepts doc.comment.added event with docId", () => {
    const event = {
      ...baseEvent,
      type: "doc.comment.added",
      payload: { docId: ID, commentId: ID2, body: "Comment", anchor: null },
      chatChannelId: null,
      docId: ID,
    };
    expect(eventSchema.parse(event)).toBeTruthy();
  });

  it("rejects event with invalid payload for the type", () => {
    const event = {
      ...baseEvent,
      type: "project.created",
      payload: { wrong: "field" },
      chatChannelId: null,
      docId: null,
    };
    const result = eventSchema.safeParse(event);
    expect(result.success).toBe(false);
  });

  it("rejects event with invalid type", () => {
    const event = {
      ...baseEvent,
      type: "bogus.type",
      payload: {},
      chatChannelId: null,
      docId: null,
    };
    const result = eventSchema.safeParse(event);
    expect(result.success).toBe(false);
  });

  it("rejects event with missing id", () => {
    const event = {
      projectId: ID,
      actorUserId: ID,
      type: "project.created",
      payload: { name: "P" },
      chatChannelId: null,
      docId: null,
      createdAt: TS,
    };
    const result = eventSchema.safeParse(event);
    expect(result.success).toBe(false);
  });

  it("rejects event with missing projectId", () => {
    const event = {
      id: ID,
      actorUserId: ID,
      type: "project.created",
      payload: { name: "P" },
      chatChannelId: null,
      docId: null,
      createdAt: TS,
    };
    const result = eventSchema.safeParse(event);
    expect(result.success).toBe(false);
  });

  it("rejects event with invalid createdAt", () => {
    const event = {
      ...baseEvent,
      type: "project.created",
      payload: { name: "P" },
      chatChannelId: null,
      docId: null,
      createdAt: -1,
    };
    const result = eventSchema.safeParse(event);
    expect(result.success).toBe(false);
  });

  it("allows task.completed with null chatChannelId (not in chat-required list)", () => {
    const event = {
      ...baseEvent,
      type: "task.completed",
      payload: { taskId: ID },
      chatChannelId: null,
      docId: null,
    };
    expect(eventSchema.parse(event)).toBeTruthy();
  });

  it("allows task.reopened with null chatChannelId (not in chat-required list)", () => {
    const event = {
      ...baseEvent,
      type: "task.reopened",
      payload: { taskId: ID },
      chatChannelId: null,
      docId: null,
    };
    expect(eventSchema.parse(event)).toBeTruthy();
  });

  it("allows chat.created with null chatChannelId (not in chat-required list)", () => {
    const event = {
      ...baseEvent,
      type: "chat.created",
      payload: { chatChannelId: ID, name: "General" },
      chatChannelId: null,
      docId: null,
    };
    expect(eventSchema.parse(event)).toBeTruthy();
  });

  it("allows chat.renamed with null chatChannelId (not in chat-required list)", () => {
    const event = {
      ...baseEvent,
      type: "chat.renamed",
      payload: { chatChannelId: ID, name: "Renamed" },
      chatChannelId: null,
      docId: null,
    };
    expect(eventSchema.parse(event)).toBeTruthy();
  });

  it("allows chat.deleted with null chatChannelId (not in chat-required list)", () => {
    const event = {
      ...baseEvent,
      type: "chat.deleted",
      payload: { chatChannelId: ID },
      chatChannelId: null,
      docId: null,
    };
    expect(eventSchema.parse(event)).toBeTruthy();
  });
});

// ─── timelineDisplaySchema ────────────────────────────────────

describe("timelineDisplaySchema", () => {
  it("accepts valid chat timeline display", () => {
    const data = { workspaceType: "chat", workspaceItemId: ID };
    expect(timelineDisplaySchema.parse(data)).toEqual(data);
  });

  it("accepts valid doc timeline display", () => {
    const data = { workspaceType: "doc", workspaceItemId: ID };
    expect(timelineDisplaySchema.parse(data)).toEqual(data);
  });

  it("rejects invalid workspaceType", () => {
    const result = timelineDisplaySchema.safeParse({
      workspaceType: "task",
      workspaceItemId: ID,
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing workspaceItemId", () => {
    const result = timelineDisplaySchema.safeParse({ workspaceType: "chat" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid ULID for workspaceItemId", () => {
    const result = timelineDisplaySchema.safeParse({
      workspaceType: "chat",
      workspaceItemId: "bad",
    });
    expect(result.success).toBe(false);
  });
});
