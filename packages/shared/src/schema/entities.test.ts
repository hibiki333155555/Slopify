import { describe, it, expect } from "vitest";
import {
  userProfileSchema,
  setupInputSchema,
  connectionConfigSchema,
  settingsSchema,
  memberSchema,
  projectSummarySchema,
  chatChannelSchema,
  taskSchema,
  decisionSchema,
  docSchema,
  docCommentSchema,
  timelineReactionSchema,
  replyPreviewSchema,
  timelineEventSchema,
  workspaceStateSchema,
  bootstrapSchema,
} from "./entities.js";

const ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const ID2 = "01BRZ3NDEKTSV4RRFFQ69G5FAV";
const ID3 = "01CRZ3NDEKTSV4RRFFQ69G5FAV";
const TS = 1700000000000;

// ─── userProfileSchema ──────────────────────────────────────────

describe("userProfileSchema", () => {
  it("accepts valid profile", () => {
    const data = {
      userId: ID,
      displayName: "Alice",
      avatarUrl: "https://example.com/avatar.png",
      createdAt: TS,
    };
    expect(userProfileSchema.parse(data)).toEqual(data);
  });

  it("accepts valid profile with null avatarUrl", () => {
    const data = {
      userId: ID,
      displayName: "Alice",
      avatarUrl: null,
      createdAt: TS,
    };
    expect(userProfileSchema.parse(data)).toEqual(data);
  });

  it("rejects missing userId", () => {
    const result = userProfileSchema.safeParse({
      displayName: "Alice",
      avatarUrl: null,
      createdAt: TS,
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty displayName", () => {
    const result = userProfileSchema.safeParse({
      userId: ID,
      displayName: "",
      avatarUrl: null,
      createdAt: TS,
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid ULID", () => {
    const result = userProfileSchema.safeParse({
      userId: "bad-id",
      displayName: "Alice",
      avatarUrl: null,
      createdAt: TS,
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative createdAt", () => {
    const result = userProfileSchema.safeParse({
      userId: ID,
      displayName: "Alice",
      avatarUrl: null,
      createdAt: -1,
    });
    expect(result.success).toBe(false);
  });
});

// ─── setupInputSchema ───────────────────────────────────────────

describe("setupInputSchema", () => {
  it("accepts valid setup input with http url avatar", () => {
    const result = setupInputSchema.parse({
      displayName: "Alice",
      avatarUrl: "https://example.com/avatar.png",
      serverUrl: "https://sync.example.com",
      serverAccessPassword: "secret123",
    });
    expect(result.displayName).toBe("Alice");
    expect(result.avatarUrl).toBe("https://example.com/avatar.png");
  });

  it("transforms empty avatarUrl to null", () => {
    const result = setupInputSchema.parse({
      displayName: "Alice",
      avatarUrl: "",
      serverUrl: "https://sync.example.com",
      serverAccessPassword: "secret123",
    });
    expect(result.avatarUrl).toBeNull();
  });

  it("accepts data: URL for avatarUrl", () => {
    const result = setupInputSchema.parse({
      displayName: "Alice",
      avatarUrl: "data:image/png;base64,abc",
      serverUrl: "https://sync.example.com",
      serverAccessPassword: "secret123",
    });
    expect(result.avatarUrl).toBe("data:image/png;base64,abc");
  });

  it("rejects missing displayName", () => {
    const result = setupInputSchema.safeParse({
      avatarUrl: "",
      serverUrl: "https://sync.example.com",
      serverAccessPassword: "secret123",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty displayName", () => {
    const result = setupInputSchema.safeParse({
      displayName: "",
      avatarUrl: "",
      serverUrl: "https://sync.example.com",
      serverAccessPassword: "secret123",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid serverUrl", () => {
    const result = setupInputSchema.safeParse({
      displayName: "Alice",
      avatarUrl: "",
      serverUrl: "not-a-url",
      serverAccessPassword: "secret123",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty serverAccessPassword", () => {
    const result = setupInputSchema.safeParse({
      displayName: "Alice",
      avatarUrl: "",
      serverUrl: "https://sync.example.com",
      serverAccessPassword: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid avatarUrl (ftp)", () => {
    const result = setupInputSchema.safeParse({
      displayName: "Alice",
      avatarUrl: "ftp://example.com/avatar.png",
      serverUrl: "https://sync.example.com",
      serverAccessPassword: "secret123",
    });
    expect(result.success).toBe(false);
  });
});

// ─── connectionConfigSchema ─────────────────────────────────────

describe("connectionConfigSchema", () => {
  it("accepts valid config", () => {
    const data = {
      serverUrl: "https://sync.example.com",
      serverAccessPassword: "secret",
    };
    expect(connectionConfigSchema.parse(data)).toEqual(data);
  });

  it("rejects missing serverUrl", () => {
    const result = connectionConfigSchema.safeParse({ serverAccessPassword: "secret" });
    expect(result.success).toBe(false);
  });

  it("rejects missing serverAccessPassword", () => {
    const result = connectionConfigSchema.safeParse({
      serverUrl: "https://sync.example.com",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid serverUrl", () => {
    const result = connectionConfigSchema.safeParse({
      serverUrl: "not-a-url",
      serverAccessPassword: "secret",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty serverAccessPassword", () => {
    const result = connectionConfigSchema.safeParse({
      serverUrl: "https://sync.example.com",
      serverAccessPassword: "",
    });
    expect(result.success).toBe(false);
  });
});

// ─── settingsSchema ─────────────────────────────────────────────

describe("settingsSchema", () => {
  it("accepts valid settings", () => {
    const data = {
      displayName: "Alice",
      avatarUrl: "https://example.com/avatar.png",
      serverUrl: "https://sync.example.com",
    };
    expect(settingsSchema.parse(data)).toEqual(data);
  });

  it("accepts null avatarUrl", () => {
    const data = {
      displayName: "Alice",
      avatarUrl: null,
      serverUrl: "https://sync.example.com",
    };
    expect(settingsSchema.parse(data)).toEqual(data);
  });

  it("rejects empty displayName", () => {
    const result = settingsSchema.safeParse({
      displayName: "",
      avatarUrl: null,
      serverUrl: "https://sync.example.com",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing serverUrl", () => {
    const result = settingsSchema.safeParse({
      displayName: "Alice",
      avatarUrl: null,
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid serverUrl", () => {
    const result = settingsSchema.safeParse({
      displayName: "Alice",
      avatarUrl: null,
      serverUrl: "not-a-url",
    });
    expect(result.success).toBe(false);
  });
});

// ─── memberSchema ───────────────────────────────────────────────

describe("memberSchema", () => {
  it("accepts valid member", () => {
    const data = {
      projectId: ID,
      userId: ID2,
      displayName: "Bob",
      avatarUrl: "https://example.com/bob.png",
      joinedAt: TS,
    };
    expect(memberSchema.parse(data)).toEqual(data);
  });

  it("accepts null avatarUrl", () => {
    const data = {
      projectId: ID,
      userId: ID2,
      displayName: "Bob",
      avatarUrl: null,
      joinedAt: TS,
    };
    expect(memberSchema.parse(data)).toEqual(data);
  });

  it("rejects missing projectId", () => {
    const result = memberSchema.safeParse({
      userId: ID2,
      displayName: "Bob",
      avatarUrl: null,
      joinedAt: TS,
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid ULID for userId", () => {
    const result = memberSchema.safeParse({
      projectId: ID,
      userId: "bad",
      displayName: "Bob",
      avatarUrl: null,
      joinedAt: TS,
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty displayName", () => {
    const result = memberSchema.safeParse({
      projectId: ID,
      userId: ID2,
      displayName: "",
      avatarUrl: null,
      joinedAt: TS,
    });
    expect(result.success).toBe(false);
  });
});

// ─── projectSummarySchema ───────────────────────────────────────

describe("projectSummarySchema", () => {
  const validProject = {
    projectId: ID,
    name: "My Project",
    createdAt: TS,
    updatedAt: TS,
    memberCount: 3,
    lastActivityAt: TS,
    unreadCount: 0,
  };

  it("accepts valid project summary", () => {
    expect(projectSummarySchema.parse(validProject)).toEqual(validProject);
  });

  it("rejects missing name", () => {
    const { name, ...rest } = validProject;
    expect(projectSummarySchema.safeParse(rest).success).toBe(false);
  });

  it("rejects empty name", () => {
    expect(projectSummarySchema.safeParse({ ...validProject, name: "" }).success).toBe(false);
  });

  it("rejects negative memberCount", () => {
    expect(
      projectSummarySchema.safeParse({ ...validProject, memberCount: -1 }).success
    ).toBe(false);
  });

  it("rejects float memberCount", () => {
    expect(
      projectSummarySchema.safeParse({ ...validProject, memberCount: 1.5 }).success
    ).toBe(false);
  });

  it("rejects negative unreadCount", () => {
    expect(
      projectSummarySchema.safeParse({ ...validProject, unreadCount: -1 }).success
    ).toBe(false);
  });

  it("rejects invalid projectId", () => {
    expect(
      projectSummarySchema.safeParse({ ...validProject, projectId: "bad" }).success
    ).toBe(false);
  });
});

// ─── chatChannelSchema ──────────────────────────────────────────

describe("chatChannelSchema", () => {
  const validChannel = {
    chatChannelId: ID,
    projectId: ID2,
    name: "General",
    createdAt: TS,
    updatedAt: TS,
  };

  it("accepts valid channel", () => {
    expect(chatChannelSchema.parse(validChannel)).toEqual(validChannel);
  });

  it("rejects missing chatChannelId", () => {
    const { chatChannelId, ...rest } = validChannel;
    expect(chatChannelSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects empty name", () => {
    expect(chatChannelSchema.safeParse({ ...validChannel, name: "" }).success).toBe(false);
  });

  it("rejects invalid projectId", () => {
    expect(
      chatChannelSchema.safeParse({ ...validChannel, projectId: "bad" }).success
    ).toBe(false);
  });
});

// ─── taskSchema ─────────────────────────────────────────────────

describe("taskSchema", () => {
  const validTask = {
    taskId: ID,
    projectId: ID2,
    chatChannelId: ID3,
    title: "Fix bug",
    completed: false,
    createdAt: TS,
    updatedAt: TS,
  };

  it("accepts valid task", () => {
    expect(taskSchema.parse(validTask)).toEqual(validTask);
  });

  it("accepts completed task", () => {
    expect(taskSchema.parse({ ...validTask, completed: true })).toBeTruthy();
  });

  it("rejects missing title", () => {
    const { title, ...rest } = validTask;
    expect(taskSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects empty title", () => {
    expect(taskSchema.safeParse({ ...validTask, title: "" }).success).toBe(false);
  });

  it("rejects non-boolean completed", () => {
    expect(taskSchema.safeParse({ ...validTask, completed: "yes" }).success).toBe(false);
  });

  it("rejects missing completed", () => {
    const { completed, ...rest } = validTask;
    expect(taskSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects invalid taskId", () => {
    expect(taskSchema.safeParse({ ...validTask, taskId: "bad" }).success).toBe(false);
  });
});

// ─── decisionSchema ─────────────────────────────────────────────

describe("decisionSchema", () => {
  const validDecision = {
    decisionId: ID,
    projectId: ID2,
    chatChannelId: ID3,
    title: "Decision 1",
    body: "We decided to use TypeScript",
    createdAt: TS,
    updatedAt: TS,
  };

  it("accepts valid decision", () => {
    expect(decisionSchema.parse(validDecision)).toEqual(validDecision);
  });

  it("rejects empty title", () => {
    expect(decisionSchema.safeParse({ ...validDecision, title: "" }).success).toBe(false);
  });

  it("rejects empty body", () => {
    expect(decisionSchema.safeParse({ ...validDecision, body: "" }).success).toBe(false);
  });

  it("rejects missing decisionId", () => {
    const { decisionId, ...rest } = validDecision;
    expect(decisionSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects invalid chatChannelId", () => {
    expect(
      decisionSchema.safeParse({ ...validDecision, chatChannelId: "bad" }).success
    ).toBe(false);
  });
});

// ─── docSchema ──────────────────────────────────────────────────

describe("docSchema", () => {
  const validDoc = {
    docId: ID,
    projectId: ID2,
    title: "My Doc",
    markdown: "# Hello World",
    createdAt: TS,
    updatedAt: TS,
  };

  it("accepts valid doc", () => {
    expect(docSchema.parse(validDoc)).toEqual(validDoc);
  });

  it("accepts empty markdown", () => {
    expect(docSchema.parse({ ...validDoc, markdown: "" })).toBeTruthy();
  });

  it("rejects empty title", () => {
    expect(docSchema.safeParse({ ...validDoc, title: "" }).success).toBe(false);
  });

  it("rejects missing docId", () => {
    const { docId, ...rest } = validDoc;
    expect(docSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects missing markdown", () => {
    const { markdown, ...rest } = validDoc;
    expect(docSchema.safeParse(rest).success).toBe(false);
  });
});

// ─── docCommentSchema ───────────────────────────────────────────

describe("docCommentSchema", () => {
  const validComment = {
    commentId: ID,
    projectId: ID2,
    docId: ID3,
    authorUserId: ID,
    body: "Great doc!",
    anchor: "section-1",
    createdAt: TS,
  };

  it("accepts valid comment with anchor", () => {
    expect(docCommentSchema.parse(validComment)).toEqual(validComment);
  });

  it("accepts valid comment with null anchor", () => {
    const data = { ...validComment, anchor: null };
    expect(docCommentSchema.parse(data)).toEqual(data);
  });

  it("rejects empty body", () => {
    expect(docCommentSchema.safeParse({ ...validComment, body: "" }).success).toBe(false);
  });

  it("rejects missing authorUserId", () => {
    const { authorUserId, ...rest } = validComment;
    expect(docCommentSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects invalid commentId", () => {
    expect(
      docCommentSchema.safeParse({ ...validComment, commentId: "bad" }).success
    ).toBe(false);
  });

  it("rejects missing docId", () => {
    const { docId, ...rest } = validComment;
    expect(docCommentSchema.safeParse(rest).success).toBe(false);
  });
});

// ─── timelineReactionSchema ─────────────────────────────────────

describe("timelineReactionSchema", () => {
  it("accepts valid reaction", () => {
    const data = { emoji: "👍", count: 3, reacted: true };
    expect(timelineReactionSchema.parse(data)).toEqual(data);
  });

  it("accepts zero count", () => {
    const data = { emoji: "👍", count: 0, reacted: false };
    expect(timelineReactionSchema.parse(data)).toEqual(data);
  });

  it("rejects negative count", () => {
    expect(
      timelineReactionSchema.safeParse({ emoji: "👍", count: -1, reacted: false }).success
    ).toBe(false);
  });

  it("rejects float count", () => {
    expect(
      timelineReactionSchema.safeParse({ emoji: "👍", count: 1.5, reacted: false }).success
    ).toBe(false);
  });

  it("rejects missing emoji", () => {
    expect(timelineReactionSchema.safeParse({ count: 1, reacted: false }).success).toBe(false);
  });

  it("rejects missing reacted", () => {
    expect(timelineReactionSchema.safeParse({ emoji: "👍", count: 1 }).success).toBe(false);
  });

  it("rejects non-boolean reacted", () => {
    expect(
      timelineReactionSchema.safeParse({ emoji: "👍", count: 1, reacted: "yes" }).success
    ).toBe(false);
  });
});

// ─── replyPreviewSchema ─────────────────────────────────────────

describe("replyPreviewSchema", () => {
  it("accepts valid reply preview", () => {
    const data = { actorDisplayName: "Alice", text: "Hello!" };
    expect(replyPreviewSchema.parse(data)).toEqual(data);
  });

  it("accepts empty strings (no min constraint)", () => {
    const data = { actorDisplayName: "", text: "" };
    expect(replyPreviewSchema.parse(data)).toEqual(data);
  });

  it("rejects missing actorDisplayName", () => {
    expect(replyPreviewSchema.safeParse({ text: "Hello" }).success).toBe(false);
  });

  it("rejects missing text", () => {
    expect(replyPreviewSchema.safeParse({ actorDisplayName: "Alice" }).success).toBe(false);
  });

  it("rejects non-string values", () => {
    expect(replyPreviewSchema.safeParse({ actorDisplayName: 123, text: "hi" }).success).toBe(
      false
    );
  });
});

// ─── timelineEventSchema ────────────────────────────────────────

describe("timelineEventSchema", () => {
  const validTimelineEvent = {
    id: ID,
    projectId: ID2,
    actorUserId: ID3,
    type: "message.posted" as const,
    payload: { chatChannelId: ID, body: "Hello" },
    chatChannelId: ID,
    docId: null,
    createdAt: TS,
    actorDisplayName: "Alice",
    actorAvatarUrl: "https://example.com/avatar.png",
    timelineText: "Alice posted a message",
  };

  it("accepts valid timeline event with required fields only", () => {
    expect(timelineEventSchema.parse(validTimelineEvent)).toEqual(validTimelineEvent);
  });

  it("accepts timeline event with all optional fields", () => {
    const data = {
      ...validTimelineEvent,
      edited: true,
      reactions: [{ emoji: "👍", count: 1, reacted: true }],
      replyPreview: { actorDisplayName: "Bob", text: "Reply text" },
    };
    expect(timelineEventSchema.parse(data)).toEqual(data);
  });

  it("accepts timeline event with null actorAvatarUrl", () => {
    const data = { ...validTimelineEvent, actorAvatarUrl: null };
    expect(timelineEventSchema.parse(data)).toEqual(data);
  });

  it("accepts timeline event with null chatChannelId and docId set", () => {
    const data = {
      ...validTimelineEvent,
      type: "doc.created" as const,
      payload: { docId: ID, title: "Doc", markdown: "" },
      chatChannelId: null,
      docId: ID,
    };
    expect(timelineEventSchema.parse(data)).toBeTruthy();
  });

  it("rejects missing actorDisplayName", () => {
    const { actorDisplayName, ...rest } = validTimelineEvent;
    expect(timelineEventSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects empty actorDisplayName", () => {
    expect(
      timelineEventSchema.safeParse({ ...validTimelineEvent, actorDisplayName: "" }).success
    ).toBe(false);
  });

  it("rejects missing timelineText", () => {
    const { timelineText, ...rest } = validTimelineEvent;
    expect(timelineEventSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects invalid type", () => {
    expect(
      timelineEventSchema.safeParse({ ...validTimelineEvent, type: "bogus" }).success
    ).toBe(false);
  });

  it("accepts edited=false", () => {
    const data = { ...validTimelineEvent, edited: false };
    expect(timelineEventSchema.parse(data).edited).toBe(false);
  });

  it("accepts empty reactions array", () => {
    const data = { ...validTimelineEvent, reactions: [] };
    expect(timelineEventSchema.parse(data).reactions).toEqual([]);
  });
});

// ─── workspaceStateSchema ───────────────────────────────────────

describe("workspaceStateSchema", () => {
  const validWorkspace = {
    project: {
      projectId: ID,
      name: "My Project",
      createdAt: TS,
      updatedAt: TS,
      memberCount: 2,
      lastActivityAt: TS,
      unreadCount: 0,
    },
    members: [
      {
        projectId: ID,
        userId: ID2,
        displayName: "Alice",
        avatarUrl: null,
        joinedAt: TS,
      },
    ],
    channels: [
      {
        chatChannelId: ID3,
        projectId: ID,
        name: "General",
        createdAt: TS,
        updatedAt: TS,
      },
    ],
    tasks: [],
    decisions: [],
    docs: [],
    selectedWorkspaceType: "chat" as const,
    selectedWorkspaceItemId: ID3,
  };

  it("accepts valid workspace state", () => {
    expect(workspaceStateSchema.parse(validWorkspace)).toEqual(validWorkspace);
  });

  it("accepts workspace with doc selected", () => {
    const data = { ...validWorkspace, selectedWorkspaceType: "doc" as const };
    expect(workspaceStateSchema.parse(data)).toBeTruthy();
  });

  it("accepts workspace with empty arrays", () => {
    const data = {
      ...validWorkspace,
      members: [],
      channels: [],
      tasks: [],
      decisions: [],
      docs: [],
    };
    expect(workspaceStateSchema.parse(data)).toBeTruthy();
  });

  it("rejects missing project", () => {
    const { project, ...rest } = validWorkspace;
    expect(workspaceStateSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects invalid selectedWorkspaceType", () => {
    expect(
      workspaceStateSchema.safeParse({ ...validWorkspace, selectedWorkspaceType: "task" }).success
    ).toBe(false);
  });

  it("rejects invalid selectedWorkspaceItemId", () => {
    expect(
      workspaceStateSchema.safeParse({ ...validWorkspace, selectedWorkspaceItemId: "bad" })
        .success
    ).toBe(false);
  });

  it("rejects missing members array", () => {
    const { members, ...rest } = validWorkspace;
    expect(workspaceStateSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects invalid member in members array", () => {
    const data = {
      ...validWorkspace,
      members: [{ projectId: "bad", userId: ID2, displayName: "A", avatarUrl: null, joinedAt: TS }],
    };
    expect(workspaceStateSchema.safeParse(data).success).toBe(false);
  });
});

// ─── bootstrapSchema ───────────────────────────────────────────

describe("bootstrapSchema", () => {
  it("accepts bootstrap with completed setup", () => {
    const data = {
      hasCompletedSetup: true,
      me: {
        userId: ID,
        displayName: "Alice",
        avatarUrl: null,
        createdAt: TS,
      },
      settings: {
        displayName: "Alice",
        avatarUrl: null,
        serverUrl: "https://sync.example.com",
      },
    };
    expect(bootstrapSchema.parse(data)).toEqual(data);
  });

  it("accepts bootstrap without setup (nulls)", () => {
    const data = {
      hasCompletedSetup: false,
      me: null,
      settings: null,
    };
    expect(bootstrapSchema.parse(data)).toEqual(data);
  });

  it("rejects missing hasCompletedSetup", () => {
    const result = bootstrapSchema.safeParse({ me: null, settings: null });
    expect(result.success).toBe(false);
  });

  it("rejects non-boolean hasCompletedSetup", () => {
    const result = bootstrapSchema.safeParse({
      hasCompletedSetup: "true",
      me: null,
      settings: null,
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid me profile", () => {
    const result = bootstrapSchema.safeParse({
      hasCompletedSetup: true,
      me: { userId: "bad" },
      settings: null,
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid settings", () => {
    const result = bootstrapSchema.safeParse({
      hasCompletedSetup: true,
      me: null,
      settings: { displayName: "Alice" },
    });
    expect(result.success).toBe(false);
  });
});
