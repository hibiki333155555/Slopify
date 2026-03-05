import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { marked } from "marked";
import { getSelectedDoc, useAppStore } from "./store.js";

marked.setOptions({ breaks: true, gfm: true });

const renderMarkdown = (text: string): string =>
  marked.parse(text, { async: false }) as string;

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

/* ------------------------------------------------------------------ */
/*  Setup Screen                                                       */
/* ------------------------------------------------------------------ */

const SetupScreen = (): JSX.Element => {
  const completeSetup = useAppStore((state) => state.completeSetup);
  const loading = useAppStore((state) => state.loading);

  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [serverUrl, setServerUrl] = useState("http://127.0.0.1:4000");
  const [serverAccessPassword, setServerAccessPassword] = useState("");

  const onSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    await completeSetup({ displayName, avatarUrl, serverUrl, serverAccessPassword });
  };

  return (
    <main className="min-h-screen bg-zinc-950 flex items-center justify-center p-6">
      <form
        onSubmit={(e) => void onSubmit(e)}
        className="bg-zinc-900 border border-zinc-700/60 rounded-xl shadow-2xl w-full max-w-md p-6"
      >
        <h1 className="text-sm font-semibold text-zinc-100 mb-1">Welcome to Slopify</h1>
        <p className="text-[11px] text-zinc-500 mb-5">
          Connect to your sync server and finish your profile.
        </p>

        <label className="block mb-4">
          <span className="text-[10px] font-medium text-zinc-500 tracking-wide uppercase">
            Display name
          </span>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            className="mt-1 w-full px-3 py-2 bg-zinc-800/80 border border-zinc-700/60 rounded-md text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors"
          />
        </label>

        <label className="block mb-4">
          <span className="text-[10px] font-medium text-zinc-500 tracking-wide uppercase">
            Avatar URL (optional)
          </span>
          <input
            value={avatarUrl}
            onChange={(e) => setAvatarUrl(e.target.value)}
            className="mt-1 w-full px-3 py-2 bg-zinc-800/80 border border-zinc-700/60 rounded-md text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors"
          />
        </label>

        <label className="block mb-4">
          <span className="text-[10px] font-medium text-zinc-500 tracking-wide uppercase">
            Server URL
          </span>
          <input
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            required
            className="mt-1 w-full px-3 py-2 bg-zinc-800/80 border border-zinc-700/60 rounded-md text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors"
          />
        </label>

        <label className="block mb-5">
          <span className="text-[10px] font-medium text-zinc-500 tracking-wide uppercase">
            Server access password
          </span>
          <input
            value={serverAccessPassword}
            onChange={(e) => setServerAccessPassword(e.target.value)}
            required
            type="password"
            className="mt-1 w-full px-3 py-2 bg-zinc-800/80 border border-zinc-700/60 rounded-md text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors"
          />
        </label>

        <button
          type="submit"
          disabled={loading}
          className="w-full px-4 py-2 text-xs font-medium bg-zinc-100 text-zinc-900 rounded-md hover:bg-zinc-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Continue
        </button>
      </form>
    </main>
  );
};

/* ------------------------------------------------------------------ */
/*  Projects Screen                                                    */
/* ------------------------------------------------------------------ */

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
    <main className="projects-screen min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      {/* Header */}
      <header className="border-b border-zinc-800/80 bg-zinc-950/90 sticky top-0 z-30 backdrop-blur-sm">
        <div className="max-w-[1440px] mx-auto px-6">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-3">
              <div
                className={`w-2 h-2 rounded-full ${syncStatus.connected ? "bg-emerald-400 animate-pulse" : "bg-zinc-600"}`}
              />
              <h1 className="text-sm font-semibold tracking-tight text-zinc-100">SLOPIFY</h1>
              <span className="text-[10px] font-mono text-zinc-600 tracking-widest uppercase">
                Projects
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="pill px-2 py-0.5 rounded-full text-[10px] font-mono border border-zinc-700 text-zinc-400">
                {syncStatus.connected ? "Online" : "Offline"}
              </span>
              <span className="pill px-2 py-0.5 rounded-full text-[10px] font-mono border border-zinc-700 text-zinc-400">
                Pending sync: {syncStatus.pendingCount}
              </span>
              <button
                type="button"
                onClick={navigateSettings}
                className="px-3 py-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 rounded-md transition-colors"
              >
                Settings
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="max-w-[1440px] mx-auto px-6 py-8 w-full flex-1">
        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
          {/* Sidebar */}
          <aside className="space-y-6">
            <div className="rounded-lg bg-zinc-900/60 border border-zinc-800/60 p-5">
              <span className="text-[11px] font-medium text-zinc-500 tracking-wide uppercase">
                Create project
              </span>
              <form onSubmit={(e) => void onCreate(e)} className="mt-3 flex flex-col gap-2.5">
                <input
                  placeholder="Project name"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-zinc-800/80 border border-zinc-700/60 rounded-md text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors"
                />
                <button
                  type="submit"
                  className="w-full px-4 py-2 text-xs font-medium bg-zinc-100 text-zinc-900 rounded-md hover:bg-zinc-200 transition-colors"
                >
                  Create
                </button>
              </form>
            </div>

            <div className="rounded-lg bg-zinc-900/60 border border-zinc-800/60 p-5">
              <span className="text-[11px] font-medium text-zinc-500 tracking-wide uppercase">
                Join project
              </span>
              <button
                type="button"
                onClick={() => setJoinModalOpen(true)}
                className="mt-3 w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md border border-dashed border-zinc-700 text-zinc-500 text-xs font-medium hover:text-zinc-300 hover:border-zinc-500 transition-colors"
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M8 3v10M3 8h10" />
                </svg>
                Join with invite
              </button>
            </div>
          </aside>

          {/* Project list */}
          <section className="rounded-lg bg-zinc-900/60 border border-zinc-800/60 p-5">
            <span className="text-[11px] font-medium text-zinc-500 tracking-wide uppercase">
              Your projects
            </span>
            {projects.length === 0 ? (
              <p className="mt-4 text-xs text-zinc-600">No projects yet. Create one to get started.</p>
            ) : (
              <div className="mt-3 space-y-1">
                {projects.map((project) => (
                  <button
                    key={project.projectId}
                    type="button"
                    onClick={() => void openProject(project.projectId)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-left hover:bg-zinc-800/50 transition-colors group"
                  >
                    <span className={`w-2 h-2 rounded-full shrink-0 ${project.unreadCount > 0 ? "bg-emerald-400" : "bg-zinc-700"}`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-zinc-200 group-hover:text-zinc-100 truncate">
                        {project.name}
                      </div>
                      <div className="text-[10px] font-mono text-zinc-600">
                        {project.memberCount} members · {formatDateTime(project.lastActivityAt)}
                      </div>
                    </div>
                    {project.unreadCount > 0 && (
                      <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-400/20 text-emerald-400 shrink-0">
                        {project.unreadCount}
                      </span>
                    )}
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-zinc-700 group-hover:text-zinc-500 shrink-0">
                      <path d="M6 3l5 5-5 5" />
                    </svg>
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Join Modal */}
      {joinModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center" role="dialog" aria-modal="true" aria-label="Join project">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setJoinModalOpen(false)} />
          <form
            onSubmit={(e) => void onJoin(e)}
            className="relative bg-zinc-900 border border-zinc-700/60 rounded-xl shadow-2xl w-full max-w-md mx-4 p-6"
          >
            <h2 className="text-sm font-semibold text-zinc-100 mb-5">Join with invite</h2>
            <label className="block mb-5">
              <span className="text-[10px] font-medium text-zinc-500 tracking-wide uppercase">Invite code</span>
              <input
                placeholder="Invite code"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                required
                className="mt-1 w-full px-3 py-2 bg-zinc-800/80 border border-zinc-700/60 rounded-md text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors font-mono"
              />
            </label>
            <div className="flex items-center gap-2 justify-end">
              <button
                type="button"
                onClick={() => setJoinModalOpen(false)}
                className="px-4 py-2 text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-medium bg-zinc-100 text-zinc-900 rounded-md hover:bg-zinc-200 transition-colors"
              >
                Join
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
};

/* ------------------------------------------------------------------ */
/*  Workspace Screen                                                   */
/* ------------------------------------------------------------------ */

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
  const updateDoc = useAppStore((state) => state.updateDoc);
  const addDocComment = useAppStore((state) => state.addDocComment);

  const [channelName, setChannelName] = useState("");
  const [docTitle, setDocTitle] = useState("");
  const [messageBody, setMessageBody] = useState("");
  const [commentBody, setCommentBody] = useState("");
  const [decisionTitle, setDecisionTitle] = useState("");
  const [decisionBody, setDecisionBody] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [decisionsOpen, setDecisionsOpen] = useState(true);
  const [decisionWidth, setDecisionWidth] = useState(320);
  const [resizing, setResizing] = useState(false);
  const isDragging = useRef(false);
  const messagesRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const el = messagesRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [workspace?.timeline.length]);

  const onDividerMouseDown = useCallback(() => {
    isDragging.current = true;
    setResizing(true);
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const w = window.innerWidth - e.clientX;
      setDecisionWidth(Math.max(200, Math.min(600, w)));
    };
    const onMouseUp = () => {
      isDragging.current = false;
      setResizing(false);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

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
      <main className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <p className="text-xs text-zinc-600">No project selected.</p>
      </main>
    );
  }

  const selectedChannelName =
    workspace.data.channels.find((ch) => ch.chatChannelId === workspace.selectedItemId)?.name ?? "general";

  return (
    <main className="workspace-screen h-screen bg-zinc-950 text-zinc-100 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="border-b border-zinc-800/80 bg-zinc-950/90 shrink-0 backdrop-blur-sm">
        <div className="px-6 flex items-center justify-between h-12">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={navigateProjects}
              className="text-[11px] font-medium text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              Projects
            </button>
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-zinc-700">
              <path d="M6 3l5 5-5 5" />
            </svg>
            <h1 className="text-sm font-semibold tracking-tight">{workspace.data.project.name}</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void createInvite()}
              className="px-3 py-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 rounded-md transition-colors"
            >
              Create Invite
            </button>
            {inviteCode !== null && (
              <span className="pill px-2 py-0.5 rounded-full text-[10px] font-mono border border-emerald-400/30 text-emerald-400 bg-emerald-400/10">
                Invite: {inviteCode}
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Layout */}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <aside className="w-56 bg-zinc-900 border-r border-zinc-800 flex flex-col shrink-0 overflow-y-auto">
          {/* Channels */}
          <div className="p-3 border-b border-zinc-800/60">
            <span className="text-[10px] font-medium text-zinc-500 tracking-widest uppercase">Chats</span>
            <nav className="mt-2 space-y-0.5">
              {workspace.data.channels.map((channel) => (
                <button
                  key={channel.chatChannelId}
                  type="button"
                  onClick={() => void selectChatChannel(channel.chatChannelId)}
                  className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-left text-xs transition-colors ${
                    workspace.selectedItemId === channel.chatChannelId
                      ? "bg-zinc-800 text-zinc-100"
                      : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"
                  }`}
                >
                  <span className="text-zinc-600">#</span>
                  <span className="truncate">{channel.name}</span>
                </button>
              ))}
            </nav>
            <form
              className="mt-2 flex gap-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                void createChannel(channelName);
                setChannelName("");
              }}
            >
              <input
                value={channelName}
                onChange={(e) => setChannelName(e.target.value)}
                placeholder="New channel"
                required
                className="flex-1 min-w-0 px-2 py-1 bg-zinc-800/80 border border-zinc-700/60 rounded text-[11px] text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors"
              />
              <button
                type="submit"
                className="px-2 py-1 text-[11px] font-medium bg-zinc-800 text-zinc-300 rounded hover:bg-zinc-700 transition-colors"
              >
                Add
              </button>
            </form>
          </div>

          {/* Docs */}
          <div className="p-3 border-b border-zinc-800/60">
            <span className="text-[10px] font-medium text-zinc-500 tracking-widest uppercase">Docs</span>
            <nav className="mt-2 space-y-0.5">
              {workspace.data.docs.map((doc) => (
                <button
                  key={doc.docId}
                  type="button"
                  onClick={() => void selectDoc(doc.docId)}
                  className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-left text-xs transition-colors ${
                    workspace.selectedItemId === doc.docId
                      ? "bg-zinc-800 text-zinc-100"
                      : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"
                  }`}
                >
                  <span className="truncate">{doc.title}</span>
                </button>
              ))}
            </nav>
            <form
              className="mt-2 flex gap-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                void createDoc({ title: docTitle, markdown: "" });
                setDocTitle("");
              }}
            >
              <input
                value={docTitle}
                onChange={(e) => setDocTitle(e.target.value)}
                placeholder="New doc"
                required
                className="flex-1 min-w-0 px-2 py-1 bg-zinc-800/80 border border-zinc-700/60 rounded text-[11px] text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors"
              />
              <button
                type="submit"
                className="px-2 py-1 text-[11px] font-medium bg-zinc-800 text-zinc-300 rounded hover:bg-zinc-700 transition-colors"
              >
                Add
              </button>
            </form>
          </div>

          {/* Members */}
          <div className="p-3">
            <span className="text-[10px] font-medium text-zinc-500 tracking-widest uppercase">Members</span>
            <ul className="mt-2 space-y-1">
              {workspace.data.members.map((member) => (
                <li key={member.userId} className="flex items-center gap-2 px-2.5 py-1">
                  <div className="w-5 h-5 rounded-full bg-violet-500/80 flex items-center justify-center text-[9px] font-bold text-white shrink-0">
                    {(member.displayName[0] ?? "?").toUpperCase()}
                  </div>
                  <span className="text-xs text-zinc-400 truncate">{member.displayName}</span>
                </li>
              ))}
            </ul>
          </div>
        </aside>

        {/* Main content */}
        <section className="flex-1 min-w-0 flex flex-col">
          {workspace.selectedType === "chat" ? (
            <div className="flex flex-1 min-h-0">
              {/* Chat panel */}
              <div className="flex-1 flex flex-col min-h-0 min-w-0">
                {/* Chat header */}
                <div className="px-5 py-3 border-b border-zinc-800/60 shrink-0 flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-300">#{selectedChannelName}</span>
                  <button
                    type="button"
                    onClick={() => setDecisionsOpen((v) => !v)}
                    className="flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-medium text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
                    title={decisionsOpen ? "Hide decisions" : "Show decisions"}
                  >
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <rect x="1" y="2" width="14" height="12" rx="1.5" />
                      <path d="M10 2v12" />
                    </svg>
                    Decisions
                  </button>
                </div>

                {/* Messages */}
                <ul ref={messagesRef} className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
                  {workspace.timeline.map((entry) => (
                    <li key={entry.id} className="flex gap-3 px-3 py-1.5 rounded hover:bg-zinc-900/40 transition-colors">
                      <div className="w-8 h-8 rounded-full bg-violet-500/80 flex items-center justify-center text-[11px] font-bold text-white shrink-0 mt-0.5">
                        {(entry.actorDisplayName[0] ?? "?").toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className="text-xs font-medium text-zinc-200">{entry.actorDisplayName}</span>
                          <span className="text-[10px] font-mono text-zinc-600">{formatTime(entry.createdAt)}</span>
                        </div>
                        {typeof entry.payload?.imageDataUrl === "string" && (
                          <img src={entry.payload.imageDataUrl as string} alt="" className="mt-1 max-w-xs max-h-60 rounded-md border border-zinc-700/40" />
                        )}
                        {entry.timelineText && (
                          <div
                            className="prose-chat text-xs text-zinc-400 mt-0.5 break-words"
                            dangerouslySetInnerHTML={{ __html: renderMarkdown(entry.timelineText) }}
                          />
                        )}
                      </div>
                    </li>
                  ))}
                </ul>

                {/* Composer */}
                <form
                  className="px-4 py-3 border-t border-zinc-800/60 shrink-0"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const body = messageBody.trim();
                    if (body.length === 0 && pendingImage === null) return;
                    void postMessage(body, pendingImage ?? undefined);
                    setMessageBody("");
                    setPendingImage(null);
                  }}
                >
                  {pendingImage !== null && (
                    <div className="mb-2 relative inline-block">
                      <img src={pendingImage} alt="preview" className="max-h-32 rounded-md border border-zinc-700/40" />
                      <button
                        type="button"
                        onClick={() => setPendingImage(null)}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-zinc-700 text-zinc-300 text-[10px] flex items-center justify-center hover:bg-zinc-600 transition-colors"
                      >
                        x
                      </button>
                    </div>
                  )}
                  <div className="flex gap-2 items-end">
                    <textarea
                      value={messageBody}
                      onChange={(e) => setMessageBody(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          const body = messageBody.trim();
                          if (body.length === 0 && pendingImage === null) return;
                          void postMessage(body, pendingImage ?? undefined);
                          setMessageBody("");
                          setPendingImage(null);
                        }
                        if (e.ctrlKey && e.key === "v") {
                          e.preventDefault();
                          void window.desktopApi.readClipboardImage().then((dataUrl) => {
                            if (dataUrl !== null) {
                              setPendingImage(dataUrl);
                            } else {
                              void navigator.clipboard.readText().then((text) => {
                                if (text) setMessageBody((prev) => prev + text);
                              });
                            }
                          });
                        }
                      }}
                      placeholder="Type a message"
                      rows={1}
                      className="flex-1 px-3 py-2 bg-zinc-800/80 border border-zinc-700/60 rounded-md text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors resize-none max-h-32 overflow-y-auto"
                    />
                    <label className="px-3 py-2 text-xs font-medium text-zinc-400 hover:text-zinc-200 bg-zinc-800 hover:bg-zinc-700 rounded-md transition-colors shrink-0 cursor-pointer flex items-center">
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <rect x="2" y="2" width="12" height="12" rx="2" />
                        <circle cx="5.5" cy="5.5" r="1" fill="currentColor" />
                        <path d="M2 11l3-3 2 2 3-3 4 4" />
                      </svg>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file === undefined) return;
                          const reader = new FileReader();
                          reader.onload = () => setPendingImage(reader.result as string);
                          reader.readAsDataURL(file);
                          e.target.value = "";
                        }}
                      />
                    </label>
                  </div>
                </form>
              </div>

              {/* Resizable divider — only when open */}
              {decisionsOpen && (
                <div
                  onMouseDown={onDividerMouseDown}
                  className="w-1 shrink-0 bg-zinc-800/60 hover:bg-zinc-500 cursor-col-resize"
                />
              )}

              {/* Decisions panel */}
              <div
                style={{ width: decisionsOpen ? decisionWidth : 0 }}
                className={`shrink-0 overflow-hidden border-l border-zinc-800/60 ${resizing ? "" : "transition-[width] duration-200 ease-out"}`}
              >
                <div className="flex flex-col h-full" style={{ width: decisionWidth }}>
                  {/* Header */}
                  <div className="px-4 py-3 border-b border-zinc-800/60 shrink-0">
                    <span className="text-[10px] font-medium text-zinc-500 tracking-widest uppercase">Decisions</span>
                  </div>

                  {/* Decision list */}
                  <div className="p-4 flex-1 overflow-y-auto">
                    <ul className="space-y-1.5">
                      {workspace.data.decisions
                        .filter((d) => d.chatChannelId === workspace.selectedItemId)
                        .map((decision) => (
                          <li key={decision.decisionId} className="px-2 py-1.5 rounded bg-zinc-900/40">
                            <div className="text-xs font-medium text-zinc-300">{decision.title}</div>
                            <div className="text-[11px] text-zinc-500 mt-0.5">{decision.body}</div>
                          </li>
                        ))}
                    </ul>
                  </div>

                  {/* Record form */}
                  <form
                    className="p-4 border-t border-zinc-800/60 shrink-0 flex flex-col gap-1.5"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const title = decisionTitle.trim();
                      const body = decisionBody.trim();
                      if (title.length === 0 || body.length === 0) return;
                      void recordDecision(title, body);
                      setDecisionTitle("");
                      setDecisionBody("");
                    }}
                  >
                    <input
                      value={decisionTitle}
                      onChange={(e) => setDecisionTitle(e.target.value)}
                      placeholder="Decision title"
                      required
                      className="w-full px-2 py-1 bg-zinc-800/80 border border-zinc-700/60 rounded text-[11px] text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors"
                    />
                    <input
                      value={decisionBody}
                      onChange={(e) => setDecisionBody(e.target.value)}
                      placeholder="Decision detail"
                      required
                      className="w-full px-2 py-1 bg-zinc-800/80 border border-zinc-700/60 rounded text-[11px] text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors"
                    />
                    <button
                      type="submit"
                      className="w-full px-2 py-1 text-[11px] font-medium bg-zinc-800 text-zinc-300 rounded hover:bg-zinc-700 transition-colors"
                    >
                      Record decision
                    </button>
                  </form>
                </div>
              </div>
            </div>
          ) : (
            selectedDoc !== null && (
              <div className="flex flex-1 min-h-0">
                {/* Doc editor */}
                <article className="flex-[2] flex flex-col min-h-0 border-r border-zinc-800/60">
                  <div className="px-5 py-3 border-b border-zinc-800/60 flex items-center justify-between shrink-0">
                    <span className="text-xs font-semibold text-zinc-300">{selectedDoc.title}</span>
                    {isDocEditing ? (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setIsDocEditing(false)}
                          className="px-3 py-1 text-[11px] font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            void updateDoc(selectedDoc.docId, docMarkdownDraft);
                            setIsDocEditing(false);
                          }}
                          className="px-3 py-1 text-[11px] font-medium bg-zinc-100 text-zinc-900 rounded hover:bg-zinc-200 transition-colors"
                        >
                          Save
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setIsDocEditing(true)}
                        className="px-3 py-1 text-[11px] font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 rounded transition-colors"
                      >
                        Edit
                      </button>
                    )}
                  </div>
                  <div className="flex-1 overflow-auto p-5">
                    {isDocEditing ? (
                      <textarea
                        value={docMarkdownDraft}
                        onChange={(e) => setDocMarkdownDraft(e.target.value)}
                        className="w-full h-full bg-transparent text-sm text-zinc-300 font-mono resize-none focus:outline-none"
                      />
                    ) : (
                      <div
                        className="prose-chat text-sm text-zinc-300"
                        dangerouslySetInnerHTML={{ __html: renderMarkdown(docMarkdownDraft) }}
                      />
                    )}
                  </div>
                </article>

                {/* Comments pane */}
                <article className="flex-1 flex flex-col min-h-0">
                  <div className="px-4 py-3 border-b border-zinc-800/60 shrink-0">
                    <span className="text-[10px] font-medium text-zinc-500 tracking-widest uppercase">Comments</span>
                  </div>
                  <ul className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
                    {(workspace.docComments[selectedDoc.docId] ?? []).map((comment) => (
                      <li key={comment.commentId} className="flex gap-2.5 px-2 py-1.5 rounded hover:bg-zinc-900/40 transition-colors">
                        <div className="w-6 h-6 rounded-full bg-violet-500/80 flex items-center justify-center text-[9px] font-bold text-white shrink-0 mt-0.5">
                          C
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-baseline gap-2">
                            <span className="text-[11px] font-medium text-zinc-300">Member</span>
                            <span className="text-[10px] font-mono text-zinc-600">{formatTime(comment.createdAt)}</span>
                          </div>
                          <p className="text-xs text-zinc-400 mt-0.5 whitespace-pre-wrap">{comment.body}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                  <form
                    className="px-3 py-3 border-t border-zinc-800/60 shrink-0"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const body = commentBody.trim();
                      if (body.length === 0) return;
                      void addDocComment(selectedDoc.docId, body);
                      setCommentBody("");
                    }}
                  >
                    <input
                      value={commentBody}
                      onChange={(e) => setCommentBody(e.target.value)}
                      placeholder="Add a comment"
                      className="w-full px-3 py-2 bg-zinc-800/80 border border-zinc-700/60 rounded-md text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors"
                    />
                  </form>
                </article>
              </div>
            )
          )}
        </section>
      </div>
    </main>
  );
};

/* ------------------------------------------------------------------ */
/*  Settings Screen                                                    */
/* ------------------------------------------------------------------ */

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
    <main className="min-h-screen bg-zinc-950 flex items-center justify-center p-6">
      <form
        className="bg-zinc-900 border border-zinc-700/60 rounded-xl shadow-2xl w-full max-w-md p-6"
        onSubmit={(e) => {
          e.preventDefault();
          void updateSettings({ displayName, avatarUrl, serverUrl, serverAccessPassword });
        }}
      >
        <h1 className="text-sm font-semibold text-zinc-100 mb-5">User Settings</h1>

        <label className="block mb-4">
          <span className="text-[10px] font-medium text-zinc-500 tracking-wide uppercase">
            Display name
          </span>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            className="mt-1 w-full px-3 py-2 bg-zinc-800/80 border border-zinc-700/60 rounded-md text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors"
          />
        </label>

        <label className="block mb-4">
          <span className="text-[10px] font-medium text-zinc-500 tracking-wide uppercase">
            Avatar URL (optional)
          </span>
          <input
            value={avatarUrl}
            onChange={(e) => setAvatarUrl(e.target.value)}
            className="mt-1 w-full px-3 py-2 bg-zinc-800/80 border border-zinc-700/60 rounded-md text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors"
          />
        </label>

        <label className="block mb-4">
          <span className="text-[10px] font-medium text-zinc-500 tracking-wide uppercase">
            Server URL
          </span>
          <input
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            required
            className="mt-1 w-full px-3 py-2 bg-zinc-800/80 border border-zinc-700/60 rounded-md text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors"
          />
        </label>

        <label className="block mb-5">
          <span className="text-[10px] font-medium text-zinc-500 tracking-wide uppercase">
            Server access password
          </span>
          <input
            value={serverAccessPassword}
            onChange={(e) => setServerAccessPassword(e.target.value)}
            required
            type="password"
            className="mt-1 w-full px-3 py-2 bg-zinc-800/80 border border-zinc-700/60 rounded-md text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors"
          />
        </label>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void clearConnection()}
            className="text-xs text-rose-400 hover:text-rose-300 transition-colors mr-auto"
          >
            Disconnect
          </button>
          <button
            type="button"
            onClick={navigateProjects}
            className="px-4 py-2 text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            Back
          </button>
          <button
            type="submit"
            className="px-4 py-2 text-xs font-medium bg-zinc-100 text-zinc-900 rounded-md hover:bg-zinc-200 transition-colors"
          >
            Save settings
          </button>
        </div>
      </form>
    </main>
  );
};

/* ------------------------------------------------------------------ */
/*  Root App                                                           */
/* ------------------------------------------------------------------ */

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
        <div className="fixed right-4 bottom-4 z-[200] flex items-center gap-3 px-4 py-3 rounded-lg bg-rose-400/10 border border-rose-400/20 text-xs text-rose-400 shadow-2xl" role="alert">
          <p>{error}</p>
          <button
            type="button"
            onClick={dismissError}
            className="text-rose-400 hover:text-rose-300 transition-colors font-medium"
          >
            Close
          </button>
        </div>
      )}

      {loading && (
        <div className="fixed top-0 left-0 right-0 z-[200] h-1 bg-zinc-800">
          <div className="h-full w-1/3 bg-emerald-400 animate-pulse rounded-r" />
        </div>
      )}

      {screen === "setup" && <SetupScreen />}
      {screen === "projects" && <ProjectsScreen />}
      {screen === "workspace" && <WorkspaceScreen />}
      {screen === "settings" && <SettingsScreen />}
      {screen === "loading" && (
        <main className="min-h-screen bg-zinc-950 flex items-center justify-center">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs text-zinc-500 font-mono">Loading...</span>
          </div>
        </main>
      )}
    </>
  );
}
