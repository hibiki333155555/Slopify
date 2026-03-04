import { FormEvent, useEffect, useState } from "react";
import { getSelectedDoc, useAppStore } from "./store.js";

const formatDateTime = (timestamp: number): string =>
  new Date(timestamp).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const formatTime = (timestamp: number): string =>
  new Date(timestamp).toLocaleString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
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
                    <span>Last activity {formatDateTime(project.lastActivityAt)}</span>
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

  const selectChatChannel = useAppStore((state) => state.selectChatChannel);
  const selectDoc = useAppStore((state) => state.selectDoc);
  const createChannel = useAppStore((state) => state.createChannel);

  const postMessage = useAppStore((state) => state.postMessage);

  const createDoc = useAppStore((state) => state.createDoc);
  const updateDoc = useAppStore((state) => state.updateDoc);
  const addDocComment = useAppStore((state) => state.addDocComment);

  const [channelName, setChannelName] = useState("");
  const [docTitle, setDocTitle] = useState("");
  const [messageBody, setMessageBody] = useState("");
  const [commentBody, setCommentBody] = useState("");

  const selectedDoc = getSelectedDoc(workspace);
  const [docMarkdownDraft, setDocMarkdownDraft] = useState("");
  const [isDocEditing, setIsDocEditing] = useState(false);

  useEffect(() => {
    if (selectedDoc !== null) {
      setDocMarkdownDraft(selectedDoc.markdown);
      setIsDocEditing(false);
    }
  }, [selectedDoc?.docId, selectedDoc?.markdown]);

  if (workspace === null) {
    return (
      <main className="screen">
        <p className="muted">No project selected.</p>
      </main>
    );
  }

  const selectedChannelName =
    workspace.data.channels.find((channel) => channel.chatChannelId === workspace.selectedItemId)?.name ?? "general";

  return (
    <main className="screen workspace-screen">
      <header className="topbar">
        <div>
          <button type="button" className="link-btn" onClick={navigateProjects}>
            Home
          </button>
          <h1 className="workspace-title">{workspace.data.project.name}</h1>
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
            <section className="discord-chat-shell">
              <header className="discord-chat-header">
                <strong>#{selectedChannelName}</strong>
              </header>

              <ul className="discord-messages">
                {workspace.timeline.map((entry) => (
                  <li key={entry.id} className="discord-message">
                    <div className="discord-avatar" aria-hidden="true">
                      {(entry.actorDisplayName[0] ?? "?").toUpperCase()}
                    </div>
                    <div className="discord-message-body">
                      <div className="discord-message-meta">
                        <strong>{entry.actorDisplayName}</strong>
                        <span>{formatTime(entry.createdAt)}</span>
                      </div>
                      <p>{entry.timelineText}</p>
                    </div>
                  </li>
                ))}
              </ul>

              <form
                className="discord-composer"
                onSubmit={(event) => {
                  event.preventDefault();
                  const body = messageBody.trim();
                  if (body.length === 0) {
                    return;
                  }
                  void postMessage(body);
                  setMessageBody("");
                }}
              >
                <input
                  value={messageBody}
                  onChange={(event) => setMessageBody(event.target.value)}
                  placeholder={`Message #${selectedChannelName}`}
                />
              </form>
            </section>
          ) : (
            selectedDoc !== null && (
              <section className="doc-layout">
                <article className="card doc-main">
                  <div className="doc-main-toolbar">
                    <strong>{selectedDoc.title}</strong>
                    {isDocEditing ? (
                      <div className="actions-row">
                        <button type="button" onClick={() => setIsDocEditing(false)}>
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            void updateDoc(selectedDoc.docId, docMarkdownDraft);
                            setIsDocEditing(false);
                          }}
                        >
                          Save
                        </button>
                      </div>
                    ) : (
                      <button type="button" onClick={() => setIsDocEditing(true)}>
                        Edit
                      </button>
                    )}
                  </div>

                  <div className="doc-surface">
                    {isDocEditing ? (
                      <textarea
                        value={docMarkdownDraft}
                        onChange={(event) => setDocMarkdownDraft(event.target.value)}
                        className="doc-textarea"
                      />
                    ) : (
                      <pre>{docMarkdownDraft}</pre>
                    )}
                  </div>
                </article>

                <article className="card doc-comments-pane">
                  <ul className="doc-comment-feed">
                    {(workspace.docComments[selectedDoc.docId] ?? []).map((comment) => (
                      <li key={comment.commentId} className="doc-comment-item">
                        <div className="doc-comment-avatar" aria-hidden="true">
                          C
                        </div>
                        <div className="doc-comment-body">
                          <div className="doc-comment-meta">
                            <strong>Member</strong>
                            <span>{formatTime(comment.createdAt)}</span>
                          </div>
                          <p>{comment.body}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                  <form
                    className="discord-composer"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const body = commentBody.trim();
                      if (body.length === 0) {
                        return;
                      }
                      void addDocComment(selectedDoc.docId, body);
                      setCommentBody("");
                    }}
                  >
                    <input
                      value={commentBody}
                      onChange={(event) => setCommentBody(event.target.value)}
                      placeholder="Add a comment"
                    />
                  </form>
                </article>
              </section>
            )
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
