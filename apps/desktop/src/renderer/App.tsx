import { FormEvent, useEffect, useMemo, useState } from "react";
import { getSelectedDoc, useAppStore } from "./store.js";

const formatTimestamp = (timestamp: number): string =>
  new Date(timestamp).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const SetupScreen = (): JSX.Element => {
  const completeSetup = useAppStore((state) => state.completeSetup);
  const loading = useAppStore((state) => state.loading);

  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [serverUrl, setServerUrl] = useState("http://127.0.0.1:4000");
  const [serverAccessPassword, setServerAccessPassword] = useState("");

  const onSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    await completeSetup({
      displayName,
      avatarUrl,
      serverUrl,
      serverAccessPassword,
    });
  };

  return (
    <main className="screen auth-screen">
      <section className="card auth-card">
        <h1>Welcome to Slopify</h1>
        <p className="muted">Connect to your sync server and finish your profile.</p>

        <form onSubmit={(event) => void onSubmit(event)} className="stack-form">
          <label>
            <span>Display name</span>
            <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} required />
          </label>

          <label>
            <span>Avatar URL (optional)</span>
            <input value={avatarUrl} onChange={(event) => setAvatarUrl(event.target.value)} />
          </label>

          <label>
            <span>Server URL</span>
            <input value={serverUrl} onChange={(event) => setServerUrl(event.target.value)} required />
          </label>

          <label>
            <span>Server access password</span>
            <input
              value={serverAccessPassword}
              onChange={(event) => setServerAccessPassword(event.target.value)}
              required
              type="password"
            />
          </label>

          <button type="submit" disabled={loading}>
            Continue
          </button>
        </form>
      </section>
    </main>
  );
};

const ProjectsScreen = (): JSX.Element => {
  const projects = useAppStore((state) => state.projects);
  const createProject = useAppStore((state) => state.createProject);
  const joinProject = useAppStore((state) => state.joinProject);
  const openProject = useAppStore((state) => state.openProject);
  const navigateSettings = useAppStore((state) => state.navigateSettings);
  const syncStatus = useAppStore((state) => state.syncStatus);

  const [projectName, setProjectName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [joinModalOpen, setJoinModalOpen] = useState(false);

  const onCreate = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    await createProject(projectName);
    setProjectName("");
  };

  const onJoin = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    await joinProject(inviteCode);
    setInviteCode("");
    setJoinModalOpen(false);
  };

  return (
    <main className="screen projects-screen">
      <header className="topbar">
        <div>
          <h1>Projects</h1>
          <p className="muted">Local-first collaboration workspace</p>
        </div>
        <div className="topbar-actions">
          <span className="pill">{syncStatus.connected ? "Online" : "Offline"}</span>
          <span className="pill">Pending sync: {syncStatus.pendingCount}</span>
          <button type="button" onClick={navigateSettings}>
            Settings
          </button>
        </div>
      </header>

      <section className="projects-layout">
        <aside className="card side-form">
          <h2>Create project</h2>
          <form onSubmit={(event) => void onCreate(event)} className="stack-form">
            <input
              placeholder="Project name"
              value={projectName}
              onChange={(event) => setProjectName(event.target.value)}
              required
            />
            <button type="submit">Create</button>
          </form>

          <h2>Join project</h2>
          <button type="button" onClick={() => setJoinModalOpen(true)}>
            Join with invite
          </button>
        </aside>

        <section className="card project-list">
          {projects.length === 0 ? (
            <p className="muted">No projects yet. Create one to get started.</p>
          ) : (
            <ul>
              {projects.map((project) => (
                <li key={project.projectId}>
                  <button type="button" className="project-item" onClick={() => void openProject(project.projectId)}>
                    <strong>{project.name}</strong>
                    <span>{project.memberCount} members</span>
                    <span>Last activity {formatTimestamp(project.lastActivityAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </section>

      {joinModalOpen && (
        <div className="join-modal-backdrop" role="dialog" aria-modal="true" aria-label="Join project">
          <section className="card join-modal">
            <h2>Join with invite</h2>
            <form onSubmit={(event) => void onJoin(event)} className="stack-form">
              <input
                placeholder="Invite code"
                value={inviteCode}
                onChange={(event) => setInviteCode(event.target.value)}
                required
              />
              <div className="actions-row">
                <button type="button" onClick={() => setJoinModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit">Join</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
};

const WorkspaceScreen = (): JSX.Element => {
  const workspace = useAppStore((state) => state.activeWorkspace);
  const navigateProjects = useAppStore((state) => state.navigateProjects);
  const createInvite = useAppStore((state) => state.createInvite);
  const inviteCode = useAppStore((state) => state.inviteCode);

  const selectChatChannel = useAppStore((state) => state.selectChatChannel);
  const selectDoc = useAppStore((state) => state.selectDoc);
  const createChannel = useAppStore((state) => state.createChannel);

  const postMessage = useAppStore((state) => state.postMessage);
  const recordDecision = useAppStore((state) => state.recordDecision);
  const createTask = useAppStore((state) => state.createTask);
  const setTaskStatus = useAppStore((state) => state.setTaskStatus);

  const createDoc = useAppStore((state) => state.createDoc);
  const renameDoc = useAppStore((state) => state.renameDoc);
  const updateDoc = useAppStore((state) => state.updateDoc);
  const addDocComment = useAppStore((state) => state.addDocComment);

  const [channelName, setChannelName] = useState("");
  const [docTitle, setDocTitle] = useState("");
  const [docRenameTitle, setDocRenameTitle] = useState("");
  const [messageBody, setMessageBody] = useState("");
  const [decisionTitle, setDecisionTitle] = useState("");
  const [decisionBody, setDecisionBody] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [commentBody, setCommentBody] = useState("");

  const selectedDoc = getSelectedDoc(workspace);
  const [docMarkdownDraft, setDocMarkdownDraft] = useState("");

  useEffect(() => {
    if (selectedDoc !== null) {
      setDocMarkdownDraft(selectedDoc.markdown);
      setDocRenameTitle(selectedDoc.title);
    }
  }, [selectedDoc?.docId, selectedDoc?.markdown, selectedDoc?.title]);

  const channelTasks = useMemo(() => {
    if (workspace === null || workspace.selectedType !== "chat") {
      return [];
    }
    return workspace.data.tasks.filter((task) => task.chatChannelId === workspace.selectedItemId);
  }, [workspace]);

  const channelDecisions = useMemo(() => {
    if (workspace === null || workspace.selectedType !== "chat") {
      return [];
    }
    return workspace.data.decisions.filter((decision) => decision.chatChannelId === workspace.selectedItemId);
  }, [workspace]);

  if (workspace === null) {
    return (
      <main className="screen">
        <p className="muted">No project selected.</p>
      </main>
    );
  }

  return (
    <main className="screen workspace-screen">
      <header className="topbar">
        <div>
          <button type="button" className="link-btn" onClick={navigateProjects}>
            Back to Projects
          </button>
          <h1>{workspace.data.project.name}</h1>
        </div>
        <div className="topbar-actions">
          <button type="button" onClick={() => void createInvite()}>
            Create Invite
          </button>
          {inviteCode !== null && <span className="pill">Invite: {inviteCode}</span>}
        </div>
      </header>

      <div className="workspace-layout">
        <aside className="workspace-sidebar">
          <section className="card nav-card">
            <h2>Chats</h2>
            <ul>
              {workspace.data.channels.map((channel) => (
                <li key={channel.chatChannelId}>
                  <button
                    type="button"
                    className={workspace.selectedItemId === channel.chatChannelId ? "selected" : ""}
                    onClick={() => void selectChatChannel(channel.chatChannelId)}
                  >
                    #{channel.name}
                  </button>
                </li>
              ))}
            </ul>
            <form
              className="inline-form"
              onSubmit={(event) => {
                event.preventDefault();
                void createChannel(channelName);
                setChannelName("");
              }}
            >
              <input
                value={channelName}
                onChange={(event) => setChannelName(event.target.value)}
                placeholder="New channel"
                required
              />
              <button type="submit">Add</button>
            </form>
          </section>

          <section className="card nav-card">
            <h2>Docs</h2>
            <ul>
              {workspace.data.docs.map((doc) => (
                <li key={doc.docId}>
                  <button
                    type="button"
                    className={workspace.selectedItemId === doc.docId ? "selected" : ""}
                    onClick={() => void selectDoc(doc.docId)}
                  >
                    {doc.title}
                  </button>
                </li>
              ))}
            </ul>
            <form
              className="inline-form"
              onSubmit={(event) => {
                event.preventDefault();
                void createDoc({ title: docTitle, markdown: "" });
                setDocTitle("");
              }}
            >
              <input value={docTitle} onChange={(event) => setDocTitle(event.target.value)} placeholder="New doc" required />
              <button type="submit">Add</button>
            </form>
          </section>

          <section className="card nav-card">
            <h2>Members</h2>
            <ul>
              {workspace.data.members.map((member) => (
                <li key={member.userId}>{member.displayName}</li>
              ))}
            </ul>
          </section>
        </aside>

        <section className="workspace-main">
          {workspace.selectedType === "chat" ? (
            <>
              <section className="card timeline-card">
                <h2>Chat timeline</h2>
                <ul className="timeline-list">
                  {workspace.timeline.map((entry) => (
                    <li key={entry.id}>
                      <header>
                        <strong>{entry.actorDisplayName}</strong>
                        <span>{formatTimestamp(entry.createdAt)}</span>
                      </header>
                      <p>{entry.timelineText}</p>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="card composer-card">
                <h2>Post Message</h2>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void postMessage(messageBody);
                    setMessageBody("");
                  }}
                  className="stack-form"
                >
                  <textarea
                    value={messageBody}
                    onChange={(event) => setMessageBody(event.target.value)}
                    placeholder="Type a message"
                    required
                  />
                  <button type="submit">Send message</button>
                </form>

                <h2>Record Decision</h2>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void recordDecision(decisionTitle, decisionBody);
                    setDecisionTitle("");
                    setDecisionBody("");
                  }}
                  className="stack-form"
                >
                  <input
                    value={decisionTitle}
                    onChange={(event) => setDecisionTitle(event.target.value)}
                    placeholder="Decision title"
                    required
                  />
                  <textarea
                    value={decisionBody}
                    onChange={(event) => setDecisionBody(event.target.value)}
                    placeholder="Decision detail"
                    required
                  />
                  <button type="submit">Record decision</button>
                </form>

                <h2>Create Task</h2>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void createTask(taskTitle);
                    setTaskTitle("");
                  }}
                  className="stack-form"
                >
                  <input
                    value={taskTitle}
                    onChange={(event) => setTaskTitle(event.target.value)}
                    placeholder="Task title"
                    required
                  />
                  <button type="submit">Create task</button>
                </form>

                <h2>Tasks</h2>
                <ul className="task-list">
                  {channelTasks.map((task) => (
                    <li key={task.taskId}>
                      <label>
                        <input
                          type="checkbox"
                          checked={task.completed}
                          onChange={(event) => void setTaskStatus(task.taskId, event.target.checked)}
                        />
                        <span className={task.completed ? "done" : ""}>{task.title}</span>
                      </label>
                    </li>
                  ))}
                </ul>

                <h2>Decisions</h2>
                <ul className="decision-list">
                  {channelDecisions.map((decision) => (
                    <li key={decision.decisionId}>
                      <strong>{decision.title}</strong>
                      <p>{decision.body}</p>
                    </li>
                  ))}
                </ul>
              </section>
            </>
          ) : (
            <>
              <section className="card doc-header">
                <h2>Document</h2>
                {selectedDoc !== null && (
                  <form
                    className="inline-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void renameDoc(selectedDoc.docId, docRenameTitle);
                    }}
                  >
                    <input
                      value={docRenameTitle}
                      onChange={(event) => setDocRenameTitle(event.target.value)}
                    />
                    <button type="submit">Rename</button>
                  </form>
                )}
              </section>

              {selectedDoc !== null && (
                <section className="doc-layout">
                  <article className="card doc-editor">
                    <h3>Markdown</h3>
                    <textarea
                      value={docMarkdownDraft}
                      onChange={(event) => setDocMarkdownDraft(event.target.value)}
                      className="doc-textarea"
                    />
                    <button type="button" onClick={() => void updateDoc(selectedDoc.docId, docMarkdownDraft)}>
                      Save document
                    </button>
                  </article>

                  <article className="card doc-preview">
                    <h3>Preview</h3>
                    <pre>{docMarkdownDraft}</pre>
                  </article>

                  <article className="card doc-comments">
                    <h3>Comments</h3>
                    <ul>
                      {(workspace.docComments[selectedDoc.docId] ?? []).map((comment) => (
                        <li key={comment.commentId}>
                          <p>{comment.body}</p>
                          <span>{formatTimestamp(comment.createdAt)}</span>
                        </li>
                      ))}
                    </ul>
                    <form
                      className="stack-form"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void addDocComment(selectedDoc.docId, commentBody);
                        setCommentBody("");
                      }}
                    >
                      <textarea
                        value={commentBody}
                        onChange={(event) => setCommentBody(event.target.value)}
                        placeholder="Add comment"
                        required
                      />
                      <button type="submit">Comment</button>
                    </form>
                  </article>
                </section>
              )}
            </>
          )}
        </section>
      </div>
    </main>
  );
};

const SettingsScreen = (): JSX.Element => {
  const bootstrap = useAppStore((state) => state.bootstrap);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const clearConnection = useAppStore((state) => state.clearConnection);
  const navigateProjects = useAppStore((state) => state.navigateProjects);

  const [displayName, setDisplayName] = useState(bootstrap?.settings?.displayName ?? "");
  const [avatarUrl, setAvatarUrl] = useState(bootstrap?.settings?.avatarUrl ?? "");
  const [serverUrl, setServerUrl] = useState(bootstrap?.settings?.serverUrl ?? "http://127.0.0.1:4000");
  const [serverAccessPassword, setServerAccessPassword] = useState("");

  return (
    <main className="screen settings-screen">
      <section className="card settings-card">
        <h1>User Settings</h1>
        <form
          className="stack-form"
          onSubmit={(event) => {
            event.preventDefault();
            void updateSettings({
              displayName,
              avatarUrl,
              serverUrl,
              serverAccessPassword,
            });
          }}
        >
          <label>
            <span>Display name</span>
            <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} required />
          </label>

          <label>
            <span>Avatar URL (optional)</span>
            <input value={avatarUrl} onChange={(event) => setAvatarUrl(event.target.value)} />
          </label>

          <label>
            <span>Server URL</span>
            <input value={serverUrl} onChange={(event) => setServerUrl(event.target.value)} required />
          </label>

          <label>
            <span>Server access password</span>
            <input
              value={serverAccessPassword}
              onChange={(event) => setServerAccessPassword(event.target.value)}
              required
              type="password"
            />
          </label>

          <div className="actions-row">
            <button type="button" onClick={navigateProjects}>
              Back
            </button>
            <button type="submit">Save settings</button>
            <button type="button" className="danger" onClick={() => void clearConnection()}>
              Disconnect
            </button>
          </div>
        </form>
      </section>
    </main>
  );
};

export default function App(): JSX.Element {
  const screen = useAppStore((state) => state.screen);
  const initialize = useAppStore((state) => state.initialize);
  const loading = useAppStore((state) => state.loading);
  const error = useAppStore((state) => state.error);
  const dismissError = useAppStore((state) => state.dismissError);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  return (
    <>
      {error !== null && (
        <aside className="error-toast" role="alert">
          <p>{error}</p>
          <button type="button" onClick={dismissError}>
            Close
          </button>
        </aside>
      )}

      {loading && <div className="loading-bar">Working...</div>}

      {screen === "setup" && <SetupScreen />}
      {screen === "projects" && <ProjectsScreen />}
      {screen === "workspace" && <WorkspaceScreen />}
      {screen === "settings" && <SettingsScreen />}
      {screen === "loading" && (
        <main className="screen">
          <p className="muted">Loading...</p>
        </main>
      )}
    </>
  );
}
