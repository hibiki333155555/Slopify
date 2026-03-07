import { describe, it, expect } from "vitest";
import {
  updateSettingsCommandSchema,
  createProjectCommandSchema,
  joinProjectCommandSchema,
  createChatChannelCommandSchema,
  renameChatChannelCommandSchema,
  deleteChatChannelCommandSchema,
  postMessageCommandSchema,
  editMessageCommandSchema,
  deleteMessageCommandSchema,
  addReactionCommandSchema,
  removeReactionCommandSchema,
  recordDecisionCommandSchema,
  createTaskCommandSchema,
  updateTaskStatusCommandSchema,
  createDocCommandSchema,
  renameDocCommandSchema,
  updateDocCommandSchema,
  addDocCommentCommandSchema,
  timelineFilterSchema,
  setupCommandSchema,
} from "./commands.js";

const ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const ID2 = "01BRZ3NDEKTSV4RRFFQ69G5FAV";
const ID3 = "01CRZ3NDEKTSV4RRFFQ69G5FAV";

// ─── updateSettingsCommandSchema ──────────────────────────────

describe("updateSettingsCommandSchema", () => {
  it("accepts valid settings with https avatar", () => {
    const result = updateSettingsCommandSchema.parse({
      displayName: "Alice",
      avatarUrl: "https://example.com/avatar.png",
      serverUrl: "https://sync.example.com",
      serverAccessPassword: "secret123",
    });
    expect(result.displayName).toBe("Alice");
    expect(result.avatarUrl).toBe("https://example.com/avatar.png");
  });

  it("transforms empty avatarUrl to null", () => {
    const result = updateSettingsCommandSchema.parse({
      displayName: "Alice",
      avatarUrl: "",
      serverUrl: "https://sync.example.com",
      serverAccessPassword: "secret123",
    });
    expect(result.avatarUrl).toBeNull();
  });

  it("accepts data: URL for avatarUrl", () => {
    const result = updateSettingsCommandSchema.parse({
      displayName: "Alice",
      avatarUrl: "data:image/png;base64,abc",
      serverUrl: "https://sync.example.com",
      serverAccessPassword: "secret123",
    });
    expect(result.avatarUrl).toBe("data:image/png;base64,abc");
  });

  it("rejects empty displayName", () => {
    const result = updateSettingsCommandSchema.safeParse({
      displayName: "",
      avatarUrl: "",
      serverUrl: "https://sync.example.com",
      serverAccessPassword: "secret123",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing serverUrl", () => {
    const result = updateSettingsCommandSchema.safeParse({
      displayName: "Alice",
      avatarUrl: "",
      serverAccessPassword: "secret123",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid serverUrl", () => {
    const result = updateSettingsCommandSchema.safeParse({
      displayName: "Alice",
      avatarUrl: "",
      serverUrl: "not-a-url",
      serverAccessPassword: "secret123",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty serverAccessPassword", () => {
    const result = updateSettingsCommandSchema.safeParse({
      displayName: "Alice",
      avatarUrl: "",
      serverUrl: "https://sync.example.com",
      serverAccessPassword: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid avatarUrl (ftp)", () => {
    const result = updateSettingsCommandSchema.safeParse({
      displayName: "Alice",
      avatarUrl: "ftp://example.com/avatar.png",
      serverUrl: "https://sync.example.com",
      serverAccessPassword: "secret123",
    });
    expect(result.success).toBe(false);
  });

  it("trims displayName", () => {
    const result = updateSettingsCommandSchema.parse({
      displayName: "  Alice  ",
      avatarUrl: "",
      serverUrl: "https://sync.example.com",
      serverAccessPassword: "secret123",
    });
    expect(result.displayName).toBe("Alice");
  });
});

// ─── createProjectCommandSchema ───────────────────────────────

describe("createProjectCommandSchema", () => {
  it("accepts valid project name", () => {
    expect(createProjectCommandSchema.parse({ name: "My Project" })).toEqual({
      name: "My Project",
    });
  });

  it("trims name whitespace", () => {
    expect(createProjectCommandSchema.parse({ name: "  Project  " })).toEqual({
      name: "Project",
    });
  });

  it("rejects empty name", () => {
    expect(createProjectCommandSchema.safeParse({ name: "" }).success).toBe(false);
  });

  it("rejects whitespace-only name", () => {
    expect(createProjectCommandSchema.safeParse({ name: "   " }).success).toBe(false);
  });

  it("rejects missing name", () => {
    expect(createProjectCommandSchema.safeParse({}).success).toBe(false);
  });

  it("rejects non-string name", () => {
    expect(createProjectCommandSchema.safeParse({ name: 123 }).success).toBe(false);
  });
});

// ─── joinProjectCommandSchema ─────────────────────────────────

describe("joinProjectCommandSchema", () => {
  it("accepts valid invite code", () => {
    expect(joinProjectCommandSchema.parse({ inviteCode: "abc123" })).toEqual({
      inviteCode: "abc123",
    });
  });

  it("trims invite code", () => {
    expect(joinProjectCommandSchema.parse({ inviteCode: "  code  " })).toEqual({
      inviteCode: "code",
    });
  });

  it("rejects empty invite code", () => {
    expect(joinProjectCommandSchema.safeParse({ inviteCode: "" }).success).toBe(false);
  });

  it("rejects missing invite code", () => {
    expect(joinProjectCommandSchema.safeParse({}).success).toBe(false);
  });
});

// ─── createChatChannelCommandSchema ───────────────────────────

describe("createChatChannelCommandSchema", () => {
  it("accepts valid command", () => {
    const data = { projectId: ID, name: "General" };
    expect(createChatChannelCommandSchema.parse(data)).toEqual(data);
  });

  it("rejects missing projectId", () => {
    expect(createChatChannelCommandSchema.safeParse({ name: "General" }).success).toBe(false);
  });

  it("rejects invalid projectId", () => {
    expect(
      createChatChannelCommandSchema.safeParse({ projectId: "bad", name: "General" }).success
    ).toBe(false);
  });

  it("rejects empty name", () => {
    expect(
      createChatChannelCommandSchema.safeParse({ projectId: ID, name: "" }).success
    ).toBe(false);
  });

  it("rejects missing name", () => {
    expect(createChatChannelCommandSchema.safeParse({ projectId: ID }).success).toBe(false);
  });
});

// ─── renameChatChannelCommandSchema ───────────────────────────

describe("renameChatChannelCommandSchema", () => {
  it("accepts valid command", () => {
    const data = { projectId: ID, chatChannelId: ID2, name: "Renamed" };
    expect(renameChatChannelCommandSchema.parse(data)).toEqual(data);
  });

  it("rejects missing chatChannelId", () => {
    expect(
      renameChatChannelCommandSchema.safeParse({ projectId: ID, name: "Renamed" }).success
    ).toBe(false);
  });

  it("rejects invalid chatChannelId", () => {
    expect(
      renameChatChannelCommandSchema.safeParse({
        projectId: ID,
        chatChannelId: "bad",
        name: "Renamed",
      }).success
    ).toBe(false);
  });

  it("rejects empty name", () => {
    expect(
      renameChatChannelCommandSchema.safeParse({
        projectId: ID,
        chatChannelId: ID2,
        name: "",
      }).success
    ).toBe(false);
  });
});

// ─── deleteChatChannelCommandSchema ───────────────────────────

describe("deleteChatChannelCommandSchema", () => {
  it("accepts valid command", () => {
    const data = { projectId: ID, chatChannelId: ID2 };
    expect(deleteChatChannelCommandSchema.parse(data)).toEqual(data);
  });

  it("rejects missing projectId", () => {
    expect(
      deleteChatChannelCommandSchema.safeParse({ chatChannelId: ID2 }).success
    ).toBe(false);
  });

  it("rejects missing chatChannelId", () => {
    expect(deleteChatChannelCommandSchema.safeParse({ projectId: ID }).success).toBe(false);
  });

  it("rejects invalid ULID", () => {
    expect(
      deleteChatChannelCommandSchema.safeParse({ projectId: "bad", chatChannelId: ID2 }).success
    ).toBe(false);
  });
});

// ─── postMessageCommandSchema ─────────────────────────────────

describe("postMessageCommandSchema", () => {
  it("accepts valid command with required fields only", () => {
    const data = { projectId: ID, chatChannelId: ID2, body: "Hello" };
    const result = postMessageCommandSchema.parse(data);
    expect(result.projectId).toBe(ID);
    expect(result.body).toBe("Hello");
  });

  it("accepts valid command with all optional fields", () => {
    const data = {
      projectId: ID,
      chatChannelId: ID2,
      body: "Hello",
      imageDataUrl: "data:image/png;base64,abc",
      replyToEventId: ID3,
    };
    const result = postMessageCommandSchema.parse(data);
    expect(result.imageDataUrl).toBe("data:image/png;base64,abc");
    expect(result.replyToEventId).toBe(ID3);
  });

  it("trims body", () => {
    const result = postMessageCommandSchema.parse({
      projectId: ID,
      chatChannelId: ID2,
      body: "  Hello  ",
    });
    expect(result.body).toBe("Hello");
  });

  it("accepts empty body (no min constraint on body)", () => {
    const result = postMessageCommandSchema.parse({
      projectId: ID,
      chatChannelId: ID2,
      body: "",
    });
    expect(result.body).toBe("");
  });

  it("rejects missing projectId", () => {
    expect(
      postMessageCommandSchema.safeParse({ chatChannelId: ID2, body: "hi" }).success
    ).toBe(false);
  });

  it("rejects missing chatChannelId", () => {
    expect(
      postMessageCommandSchema.safeParse({ projectId: ID, body: "hi" }).success
    ).toBe(false);
  });

  it("rejects missing body", () => {
    expect(
      postMessageCommandSchema.safeParse({ projectId: ID, chatChannelId: ID2 }).success
    ).toBe(false);
  });

  it("rejects invalid replyToEventId", () => {
    expect(
      postMessageCommandSchema.safeParse({
        projectId: ID,
        chatChannelId: ID2,
        body: "hi",
        replyToEventId: "bad",
      }).success
    ).toBe(false);
  });
});

// ─── editMessageCommandSchema ─────────────────────────────────

describe("editMessageCommandSchema", () => {
  it("accepts valid command", () => {
    const data = {
      projectId: ID,
      chatChannelId: ID2,
      messageEventId: ID3,
      body: "edited text",
    };
    expect(editMessageCommandSchema.parse(data)).toEqual(data);
  });

  it("trims body", () => {
    const result = editMessageCommandSchema.parse({
      projectId: ID,
      chatChannelId: ID2,
      messageEventId: ID3,
      body: "  edited  ",
    });
    expect(result.body).toBe("edited");
  });

  it("rejects empty body (has min(1))", () => {
    expect(
      editMessageCommandSchema.safeParse({
        projectId: ID,
        chatChannelId: ID2,
        messageEventId: ID3,
        body: "",
      }).success
    ).toBe(false);
  });

  it("rejects whitespace-only body (trim + min(1))", () => {
    expect(
      editMessageCommandSchema.safeParse({
        projectId: ID,
        chatChannelId: ID2,
        messageEventId: ID3,
        body: "   ",
      }).success
    ).toBe(false);
  });

  it("rejects missing messageEventId", () => {
    expect(
      editMessageCommandSchema.safeParse({
        projectId: ID,
        chatChannelId: ID2,
        body: "edited",
      }).success
    ).toBe(false);
  });

  it("rejects invalid messageEventId", () => {
    expect(
      editMessageCommandSchema.safeParse({
        projectId: ID,
        chatChannelId: ID2,
        messageEventId: "bad",
        body: "edited",
      }).success
    ).toBe(false);
  });
});

// ─── deleteMessageCommandSchema ───────────────────────────────

describe("deleteMessageCommandSchema", () => {
  it("accepts valid command", () => {
    const data = { projectId: ID, chatChannelId: ID2, messageEventId: ID3 };
    expect(deleteMessageCommandSchema.parse(data)).toEqual(data);
  });

  it("rejects missing projectId", () => {
    expect(
      deleteMessageCommandSchema.safeParse({ chatChannelId: ID2, messageEventId: ID3 }).success
    ).toBe(false);
  });

  it("rejects missing chatChannelId", () => {
    expect(
      deleteMessageCommandSchema.safeParse({ projectId: ID, messageEventId: ID3 }).success
    ).toBe(false);
  });

  it("rejects missing messageEventId", () => {
    expect(
      deleteMessageCommandSchema.safeParse({ projectId: ID, chatChannelId: ID2 }).success
    ).toBe(false);
  });
});

// ─── addReactionCommandSchema ─────────────────────────────────

describe("addReactionCommandSchema", () => {
  it("accepts valid command", () => {
    const data = { projectId: ID, chatChannelId: ID2, messageEventId: ID3, emoji: "👍" };
    expect(addReactionCommandSchema.parse(data)).toEqual(data);
  });

  it("rejects missing emoji", () => {
    expect(
      addReactionCommandSchema.safeParse({
        projectId: ID,
        chatChannelId: ID2,
        messageEventId: ID3,
      }).success
    ).toBe(false);
  });

  it("rejects missing projectId", () => {
    expect(
      addReactionCommandSchema.safeParse({
        chatChannelId: ID2,
        messageEventId: ID3,
        emoji: "👍",
      }).success
    ).toBe(false);
  });

  it("rejects invalid messageEventId", () => {
    expect(
      addReactionCommandSchema.safeParse({
        projectId: ID,
        chatChannelId: ID2,
        messageEventId: "bad",
        emoji: "👍",
      }).success
    ).toBe(false);
  });
});

// ─── removeReactionCommandSchema ──────────────────────────────

describe("removeReactionCommandSchema", () => {
  it("accepts valid command", () => {
    const data = { projectId: ID, chatChannelId: ID2, messageEventId: ID3, emoji: "👎" };
    expect(removeReactionCommandSchema.parse(data)).toEqual(data);
  });

  it("rejects missing emoji", () => {
    expect(
      removeReactionCommandSchema.safeParse({
        projectId: ID,
        chatChannelId: ID2,
        messageEventId: ID3,
      }).success
    ).toBe(false);
  });

  it("rejects missing chatChannelId", () => {
    expect(
      removeReactionCommandSchema.safeParse({
        projectId: ID,
        messageEventId: ID3,
        emoji: "👎",
      }).success
    ).toBe(false);
  });
});

// ─── recordDecisionCommandSchema ──────────────────────────────

describe("recordDecisionCommandSchema", () => {
  it("accepts valid command", () => {
    const data = {
      projectId: ID,
      chatChannelId: ID2,
      title: "Decision 1",
      body: "We decided...",
    };
    expect(recordDecisionCommandSchema.parse(data)).toEqual(data);
  });

  it("rejects empty title", () => {
    expect(
      recordDecisionCommandSchema.safeParse({
        projectId: ID,
        chatChannelId: ID2,
        title: "",
        body: "Content",
      }).success
    ).toBe(false);
  });

  it("rejects empty body", () => {
    expect(
      recordDecisionCommandSchema.safeParse({
        projectId: ID,
        chatChannelId: ID2,
        title: "Title",
        body: "",
      }).success
    ).toBe(false);
  });

  it("rejects missing projectId", () => {
    expect(
      recordDecisionCommandSchema.safeParse({
        chatChannelId: ID2,
        title: "Title",
        body: "Body",
      }).success
    ).toBe(false);
  });

  it("rejects missing chatChannelId", () => {
    expect(
      recordDecisionCommandSchema.safeParse({
        projectId: ID,
        title: "Title",
        body: "Body",
      }).success
    ).toBe(false);
  });
});

// ─── createTaskCommandSchema ──────────────────────────────────

describe("createTaskCommandSchema", () => {
  it("accepts valid command", () => {
    const data = { projectId: ID, chatChannelId: ID2, title: "Fix bug" };
    expect(createTaskCommandSchema.parse(data)).toEqual(data);
  });

  it("rejects empty title", () => {
    expect(
      createTaskCommandSchema.safeParse({ projectId: ID, chatChannelId: ID2, title: "" }).success
    ).toBe(false);
  });

  it("rejects missing projectId", () => {
    expect(
      createTaskCommandSchema.safeParse({ chatChannelId: ID2, title: "Fix bug" }).success
    ).toBe(false);
  });

  it("rejects missing chatChannelId", () => {
    expect(
      createTaskCommandSchema.safeParse({ projectId: ID, title: "Fix bug" }).success
    ).toBe(false);
  });

  it("rejects missing title", () => {
    expect(
      createTaskCommandSchema.safeParse({ projectId: ID, chatChannelId: ID2 }).success
    ).toBe(false);
  });
});

// ─── updateTaskStatusCommandSchema ────────────────────────────

describe("updateTaskStatusCommandSchema", () => {
  it("accepts valid command with completed=true", () => {
    const data = { projectId: ID, taskId: ID2, completed: true };
    expect(updateTaskStatusCommandSchema.parse(data)).toEqual(data);
  });

  it("accepts valid command with completed=false", () => {
    const data = { projectId: ID, taskId: ID2, completed: false };
    expect(updateTaskStatusCommandSchema.parse(data)).toEqual(data);
  });

  it("rejects non-boolean completed", () => {
    expect(
      updateTaskStatusCommandSchema.safeParse({ projectId: ID, taskId: ID2, completed: "yes" })
        .success
    ).toBe(false);
  });

  it("rejects missing completed", () => {
    expect(
      updateTaskStatusCommandSchema.safeParse({ projectId: ID, taskId: ID2 }).success
    ).toBe(false);
  });

  it("rejects missing taskId", () => {
    expect(
      updateTaskStatusCommandSchema.safeParse({ projectId: ID, completed: true }).success
    ).toBe(false);
  });

  it("rejects invalid taskId", () => {
    expect(
      updateTaskStatusCommandSchema.safeParse({ projectId: ID, taskId: "bad", completed: true })
        .success
    ).toBe(false);
  });
});

// ─── createDocCommandSchema ───────────────────────────────────

describe("createDocCommandSchema", () => {
  it("accepts valid command with markdown", () => {
    const data = { projectId: ID, title: "My Doc", markdown: "# Hello" };
    expect(createDocCommandSchema.parse(data)).toEqual(data);
  });

  it("defaults markdown to empty string when omitted", () => {
    const result = createDocCommandSchema.parse({ projectId: ID, title: "My Doc" });
    expect(result.markdown).toBe("");
  });

  it("rejects empty title", () => {
    expect(
      createDocCommandSchema.safeParse({ projectId: ID, title: "", markdown: "" }).success
    ).toBe(false);
  });

  it("rejects missing projectId", () => {
    expect(
      createDocCommandSchema.safeParse({ title: "My Doc", markdown: "" }).success
    ).toBe(false);
  });

  it("rejects missing title", () => {
    expect(
      createDocCommandSchema.safeParse({ projectId: ID, markdown: "" }).success
    ).toBe(false);
  });

  it("rejects invalid projectId", () => {
    expect(
      createDocCommandSchema.safeParse({ projectId: "bad", title: "Doc", markdown: "" }).success
    ).toBe(false);
  });
});

// ─── renameDocCommandSchema ───────────────────────────────────

describe("renameDocCommandSchema", () => {
  it("accepts valid command", () => {
    const data = { projectId: ID, docId: ID2, title: "Renamed Doc" };
    expect(renameDocCommandSchema.parse(data)).toEqual(data);
  });

  it("rejects empty title", () => {
    expect(
      renameDocCommandSchema.safeParse({ projectId: ID, docId: ID2, title: "" }).success
    ).toBe(false);
  });

  it("rejects missing docId", () => {
    expect(
      renameDocCommandSchema.safeParse({ projectId: ID, title: "Renamed" }).success
    ).toBe(false);
  });

  it("rejects invalid docId", () => {
    expect(
      renameDocCommandSchema.safeParse({ projectId: ID, docId: "bad", title: "Renamed" }).success
    ).toBe(false);
  });
});

// ─── updateDocCommandSchema ───────────────────────────────────

describe("updateDocCommandSchema", () => {
  it("accepts valid command", () => {
    const data = { projectId: ID, docId: ID2, markdown: "# Updated" };
    expect(updateDocCommandSchema.parse(data)).toEqual(data);
  });

  it("accepts empty markdown", () => {
    const data = { projectId: ID, docId: ID2, markdown: "" };
    expect(updateDocCommandSchema.parse(data)).toEqual(data);
  });

  it("rejects missing markdown", () => {
    expect(
      updateDocCommandSchema.safeParse({ projectId: ID, docId: ID2 }).success
    ).toBe(false);
  });

  it("rejects missing docId", () => {
    expect(
      updateDocCommandSchema.safeParse({ projectId: ID, markdown: "# Updated" }).success
    ).toBe(false);
  });

  it("rejects missing projectId", () => {
    expect(
      updateDocCommandSchema.safeParse({ docId: ID2, markdown: "# Updated" }).success
    ).toBe(false);
  });
});

// ─── addDocCommentCommandSchema ───────────────────────────────

describe("addDocCommentCommandSchema", () => {
  it("accepts valid command with anchor", () => {
    const data = { projectId: ID, docId: ID2, body: "Nice doc!", anchor: "section-1" };
    expect(addDocCommentCommandSchema.parse(data)).toEqual(data);
  });

  it("accepts valid command with null anchor", () => {
    const data = { projectId: ID, docId: ID2, body: "Nice doc!", anchor: null };
    expect(addDocCommentCommandSchema.parse(data)).toEqual(data);
  });

  it("rejects empty body", () => {
    expect(
      addDocCommentCommandSchema.safeParse({
        projectId: ID,
        docId: ID2,
        body: "",
        anchor: null,
      }).success
    ).toBe(false);
  });

  it("rejects missing body", () => {
    expect(
      addDocCommentCommandSchema.safeParse({ projectId: ID, docId: ID2, anchor: null }).success
    ).toBe(false);
  });

  it("rejects missing docId", () => {
    expect(
      addDocCommentCommandSchema.safeParse({ projectId: ID, body: "comment", anchor: null })
        .success
    ).toBe(false);
  });

  it("rejects missing projectId", () => {
    expect(
      addDocCommentCommandSchema.safeParse({ docId: ID2, body: "comment", anchor: null }).success
    ).toBe(false);
  });

  it("rejects missing anchor (it is required, must be string or null)", () => {
    expect(
      addDocCommentCommandSchema.safeParse({ projectId: ID, docId: ID2, body: "comment" }).success
    ).toBe(false);
  });
});

// ─── timelineFilterSchema ─────────────────────────────────────

describe("timelineFilterSchema", () => {
  it("accepts valid chat filter", () => {
    const data = { projectId: ID, workspaceType: "chat" as const, workspaceItemId: ID2 };
    expect(timelineFilterSchema.parse(data)).toEqual(data);
  });

  it("accepts valid doc filter", () => {
    const data = { projectId: ID, workspaceType: "doc" as const, workspaceItemId: ID2 };
    expect(timelineFilterSchema.parse(data)).toEqual(data);
  });

  it("rejects invalid workspaceType", () => {
    expect(
      timelineFilterSchema.safeParse({
        projectId: ID,
        workspaceType: "task",
        workspaceItemId: ID2,
      }).success
    ).toBe(false);
  });

  it("rejects missing projectId", () => {
    expect(
      timelineFilterSchema.safeParse({ workspaceType: "chat", workspaceItemId: ID2 }).success
    ).toBe(false);
  });

  it("rejects invalid workspaceItemId", () => {
    expect(
      timelineFilterSchema.safeParse({
        projectId: ID,
        workspaceType: "chat",
        workspaceItemId: "bad",
      }).success
    ).toBe(false);
  });

  it("rejects missing workspaceItemId", () => {
    expect(
      timelineFilterSchema.safeParse({ projectId: ID, workspaceType: "chat" }).success
    ).toBe(false);
  });
});

// ─── setupCommandSchema ──────────────────────────────────────

describe("setupCommandSchema", () => {
  it("accepts valid setup command (same as setupInputSchema)", () => {
    const result = setupCommandSchema.parse({
      displayName: "Alice",
      avatarUrl: "https://example.com/avatar.png",
      serverUrl: "https://sync.example.com",
      serverAccessPassword: "secret123",
    });
    expect(result.displayName).toBe("Alice");
    expect(result.avatarUrl).toBe("https://example.com/avatar.png");
    expect(result.serverUrl).toBe("https://sync.example.com");
    expect(result.serverAccessPassword).toBe("secret123");
  });

  it("transforms empty avatarUrl to null", () => {
    const result = setupCommandSchema.parse({
      displayName: "Alice",
      avatarUrl: "",
      serverUrl: "https://sync.example.com",
      serverAccessPassword: "secret123",
    });
    expect(result.avatarUrl).toBeNull();
  });

  it("rejects missing displayName", () => {
    expect(
      setupCommandSchema.safeParse({
        avatarUrl: "",
        serverUrl: "https://sync.example.com",
        serverAccessPassword: "secret123",
      }).success
    ).toBe(false);
  });

  it("rejects empty serverAccessPassword", () => {
    expect(
      setupCommandSchema.safeParse({
        displayName: "Alice",
        avatarUrl: "",
        serverUrl: "https://sync.example.com",
        serverAccessPassword: "",
      }).success
    ).toBe(false);
  });

  it("rejects invalid serverUrl", () => {
    expect(
      setupCommandSchema.safeParse({
        displayName: "Alice",
        avatarUrl: "",
        serverUrl: "bad-url",
        serverAccessPassword: "secret123",
      }).success
    ).toBe(false);
  });
});
