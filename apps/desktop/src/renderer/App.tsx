import { FormEvent, KeyboardEvent, useEffect, useMemo, useState } from "react";
import type { ComposerMode, LocalTimelineEvent, TimelineFilter } from "@slopify/shared";
import { useAppStore } from "./store.js";

const timelineFilters: TimelineFilter[] = ["all", "message", "decision", "task", "openTasks"];
const projectStatusFilters: Array<"all" | "active" | "paused" | "done" | "archived"> = [
  "all",
  "active",
  "paused",
  "done",
  "archived"
];

function dateLabel(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  }).format(new Date(timestamp));
}

function timeLabel(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(timestamp));
}

function groupByDate(events: LocalTimelineEvent[]): Array<{ label: string; events: LocalTimelineEvent[] }> {
  const map = new Map<string, LocalTimelineEvent[]>();
  for (const event of events) {
    const label = dateLabel(event.createdAt);
    const bucket = map.get(label) ?? [];
    bucket.push(event);
    map.set(label, bucket);
  }
  return Array.from(map.entries()).map(([label, grouped]) => ({ label, events: grouped }));
}

export function App(): JSX.Element {
  const {
    initialized,
    loading,
    error,
    profile,
    projects,
    projectFilter,
    selectedProjectId,
    roomSummary,
    openTasks,
    timelineEvents,
    timelineFilter,
    nextBeforeCreatedAt,
    inviteInfo,
    sync,
    bootstrap,
    setupProfile,
    setProjectFilter,
    createProject,
    selectProject,
    loadOlderTimeline,
    setTimelineFilter,
    postMessage,
    recordDecision,
    createTask,
    completeTask,
    reopenTask,
    createInvite,
    joinWithInvite,
    connectSync,
    disconnectSync,
    applySyncUpdate
  } = useAppStore();

  const [displayName, setDisplayName] = useState("");
  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [projectStatus, setProjectStatus] = useState<"active" | "paused" | "done" | "archived">("active");
  const [projectSearch, setProjectSearch] = useState("");

  const [composerMode, setComposerMode] = useState<ComposerMode>("message");
  const [messageBody, setMessageBody] = useState("");
  const [decisionSummary, setDecisionSummary] = useState("");
  const [decisionNote, setDecisionNote] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskAssignee, setTaskAssignee] = useState("");
  const [joinCode, setJoinCode] = useState("");

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    return window.projectLog.sync.onUpdated((payload) => {
      void applySyncUpdate(payload);
    });
  }, [applySyncUpdate]);

  const groupedEvents = useMemo(() => groupByDate(timelineEvents), [timelineEvents]);
  const openTaskIds = useMemo(() => new Set(openTasks.map((task) => task.id)), [openTasks]);

  const memberNameById = useMemo(() => {
    const map = new Map<string, string>();
    if (roomSummary) {
      for (const member of roomSummary.members) {
        map.set(member.userId, member.displayName);
      }
    }
    return map;
  }, [roomSummary]);

  const visibleProjects = useMemo(() => {
    const query = projectSearch.trim().toLowerCase();
    if (!query) {
      return projects;
    }
    return projects.filter((project) => {
      return (
        project.name.toLowerCase().includes(query) ||
        project.description.toLowerCase().includes(query)
      );
    });
  }, [projects, projectSearch]);

  const handleSetupSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!displayName.trim()) {
      return;
    }
    await setupProfile(displayName.trim());
    setDisplayName("");
  };

  const handleCreateProjectSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!projectName.trim()) {
      return;
    }
    await createProject({
      name: projectName.trim(),
      description: projectDescription.trim(),
      status: projectStatus
    });
    setProjectName("");
    setProjectDescription("");
    setProjectStatus("active");
  };

  const handleComposerSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (composerMode === "message") {
      const body = messageBody.trim();
      if (!body) {
        return;
      }
      await postMessage(body);
      setMessageBody("");
      return;
    }
    if (composerMode === "decision") {
      const summary = decisionSummary.trim();
      if (!summary) {
        return;
      }
      await recordDecision(summary, decisionNote.trim());
      setDecisionSummary("");
      setDecisionNote("");
      return;
    }
    const title = taskTitle.trim();
    if (!title) {
      return;
    }
    await createTask(title, taskAssignee.trim() || null);
    setTaskTitle("");
    setTaskAssignee("");
  };

  const handleEnterToSend = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      const form = event.currentTarget.form;
      if (form) {
        form.requestSubmit();
      }
    }
  };

  const handleJoinByCode = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!joinCode.trim()) {
      return;
    }
    await joinWithInvite(joinCode.trim());
    setJoinCode("");
  };

  if (!initialized || loading) {
    return <div className="loading-screen">Loading...</div>;
  }

  if (!profile) {
    return (
      <main className="first-launch">
        <h1>Project Log Desktop</h1>
        <p>Create your local profile.</p>
        <form onSubmit={handleSetupSubmit} className="profile-form">
          <label>
            Display Name
            <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={50} required />
          </label>
          <button type="submit">Start</button>
        </form>
        {error ? <p className="error">{error}</p> : null}
      </main>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <header className="sidebar-header">
          <h2>Projects</h2>
          <p>{profile.displayName}</p>
          <div className="sync-row">
            <span className={sync.connected ? "online" : "offline"}>{sync.connected ? "Connected" : "Offline"}</span>
            {sync.connected ? (
              <button onClick={() => void disconnectSync()}>Disconnect</button>
            ) : (
              <button onClick={() => void connectSync()}>Connect</button>
            )}
          </div>
        </header>

        <form className="create-project-form" onSubmit={handleCreateProjectSubmit}>
          <label>
            Project Name
            <input value={projectName} onChange={(event) => setProjectName(event.target.value)} maxLength={100} required />
          </label>
          <label>
            Description
            <input value={projectDescription} onChange={(event) => setProjectDescription(event.target.value)} maxLength={200} />
          </label>
          <label>
            Status
            <select value={projectStatus} onChange={(event) => setProjectStatus(event.target.value as typeof projectStatus)}>
              <option value="active">active</option>
              <option value="paused">paused</option>
              <option value="done">done</option>
              <option value="archived">archived</option>
            </select>
          </label>
          <button type="submit">Create Project</button>
        </form>

        <form className="create-project-form" onSubmit={handleJoinByCode}>
          <label>
            Invite Code
            <input value={joinCode} onChange={(event) => setJoinCode(event.target.value)} />
          </label>
          <button type="submit">Join with Invite Code</button>
        </form>

        <nav className="status-tabs">
          {projectStatusFilters.map((status) => (
            <button
              key={status}
              className={projectFilter === status ? "active" : ""}
              onClick={() => void setProjectFilter(status)}
            >
              {status}
            </button>
          ))}
        </nav>

        <div className="create-project-form">
          <label>
            Search
            <input value={projectSearch} onChange={(event) => setProjectSearch(event.target.value)} placeholder="Search projects" />
          </label>
        </div>

        <ul className="project-list">
          {visibleProjects.length === 0 ? (
            <li className="empty">
              <p>No projects yet</p>
              <p>Create your first project</p>
            </li>
          ) : (
            visibleProjects.map((project) => (
              <li key={project.id}>
                <button
                  className={selectedProjectId === project.id ? "project-item active" : "project-item"}
                  onClick={() => void selectProject(project.id)}
                >
                  <span className="project-name">{project.name}</span>
                  <span className="project-meta">{project.status}</span>
                  <span className="project-meta">Unread: {project.unreadCount}</span>
                  <span className="project-meta">Open: {project.openTaskCount}</span>
                  <span className="project-meta">Online: {project.onlineCount}</span>
                  <span className="project-meta">{timeLabel(project.lastUpdatedAt)}</span>
                </button>
              </li>
            ))
          )}
        </ul>
        <button className="load-older">Settings</button>
      </aside>

      <main className="room">
        {!roomSummary ? (
          <section className="empty-room">
            <h2>Select a project</h2>
            <p>Timeline history will appear here.</p>
          </section>
        ) : (
          <>
            <header className="room-header">
              <div>
                <h1>{roomSummary.project.name}</h1>
                <p>{roomSummary.project.description || "No description"}</p>
              </div>
              <div className="room-stats">
                <span>Status: {roomSummary.project.status}</span>
                <span>Online: {roomSummary.onlineCount}</span>
                <span>Open Tasks: {roomSummary.openTaskCount}</span>
              </div>
              <div className="latest-decisions">
                <strong>Latest decisions</strong>
                {roomSummary.latestDecisions.length === 0 ? (
                  <span>None yet</span>
                ) : (
                  roomSummary.latestDecisions.map((decision) => (
                    <span key={decision.id}>{decision.summary}</span>
                  ))
                )}
              </div>
              <div className="latest-decisions">
                <button onClick={() => void createInvite()}>Create Invite Code</button>
                {inviteInfo ? (
                  <span>
                    {inviteInfo.code} (expires {dateLabel(inviteInfo.expiresAt)})
                  </span>
                ) : null}
              </div>
            </header>

            <nav className="timeline-filters">
              {timelineFilters.map((filter) => (
                <button
                  key={filter}
                  className={timelineFilter === filter ? "active" : ""}
                  onClick={() => void setTimelineFilter(filter)}
                >
                  {filter}
                </button>
              ))}
            </nav>

            <section className="timeline">
              {nextBeforeCreatedAt !== null ? (
                <button className="load-older" onClick={() => void loadOlderTimeline()}>
                  Load older events
                </button>
              ) : null}

              {timelineFilter === "openTasks" ? (
                <div className="open-task-list">
                  {openTasks.length === 0 ? <p>No open tasks</p> : null}
                  {openTasks.map((task) => (
                    <article key={task.id} className="event-card task">
                      <header>
                        <strong>{task.title}</strong>
                        <span>{timeLabel(task.createdAt)}</span>
                      </header>
                      <p>Assignee: {task.assigneeUserId ?? "unassigned"}</p>
                      <button onClick={() => void completeTask(task.id)}>Mark complete</button>
                    </article>
                  ))}
                </div>
              ) : (
                groupedEvents.map((group) => (
                  <div key={group.label} className="timeline-group">
                    <h3>{group.label}</h3>
                    {group.events.map((event) => {
                      const actor = memberNameById.get(event.actorUserId) ?? event.actorUserId;
                      const time = timeLabel(event.createdAt);

                      if (event.eventType === "message.posted") {
                        return (
                          <article key={event.id} className="event-card message">
                            <header>
                              <span>{actor}</span>
                              <span>{time}</span>
                            </header>
                            <p>{event.payload.body}</p>
                          </article>
                        );
                      }

                      if (event.eventType === "decision.recorded") {
                        return (
                          <article key={event.id} className="event-card decision">
                            <header>
                              <strong>Decision</strong>
                              <span>{time}</span>
                            </header>
                            <p>{event.payload.summary}</p>
                            {event.payload.note ? <small>{event.payload.note}</small> : null}
                          </article>
                        );
                      }

                      if (event.eventType === "task.created") {
                        const isOpen = openTaskIds.has(event.payload.taskId);
                        return (
                          <article key={event.id} className="event-card task">
                            <header>
                              <strong>Task</strong>
                              <span>{time}</span>
                            </header>
                            <p>{event.payload.title}</p>
                            <p>Assignee: {event.payload.assigneeUserId ?? "unassigned"}</p>
                            {isOpen ? (
                              <button onClick={() => void completeTask(event.payload.taskId)}>Complete</button>
                            ) : (
                              <button onClick={() => void reopenTask(event.payload.taskId)}>Reopen</button>
                            )}
                          </article>
                        );
                      }

                      if (event.eventType === "task.completed" || event.eventType === "task.reopened") {
                        const taskId = event.payload.taskId;
                        const isOpen = openTaskIds.has(taskId);
                        return (
                          <article key={event.id} className="event-card task">
                            <header>
                              <strong>{event.eventType === "task.completed" ? "Task completed" : "Task reopened"}</strong>
                              <span>{time}</span>
                            </header>
                            <p>{taskId}</p>
                            {isOpen ? (
                              <button onClick={() => void completeTask(taskId)}>Complete</button>
                            ) : (
                              <button onClick={() => void reopenTask(taskId)}>Reopen</button>
                            )}
                          </article>
                        );
                      }

                      return (
                        <article key={event.id} className="event-card system">
                          <header>
                            <strong>{event.eventType}</strong>
                            <span>{time}</span>
                          </header>
                        </article>
                      );
                    })}
                  </div>
                ))
              )}
            </section>

            <form className="composer" onSubmit={handleComposerSubmit}>
              <div className="composer-modes">
                <button
                  type="button"
                  className={composerMode === "message" ? "active" : ""}
                  onClick={() => setComposerMode("message")}
                >
                  Message
                </button>
                <button
                  type="button"
                  className={composerMode === "decision" ? "active" : ""}
                  onClick={() => setComposerMode("decision")}
                >
                  Decision
                </button>
                <button type="button" className={composerMode === "task" ? "active" : ""} onClick={() => setComposerMode("task")}>
                  Task
                </button>
              </div>

              {composerMode === "message" ? (
                <textarea
                  value={messageBody}
                  onChange={(event) => setMessageBody(event.target.value)}
                  onKeyDown={handleEnterToSend}
                  placeholder="Write a message"
                  required
                />
              ) : null}

              {composerMode === "decision" ? (
                <div className="composer-grid">
                  <input
                    value={decisionSummary}
                    onChange={(event) => setDecisionSummary(event.target.value)}
                    placeholder="Decision summary"
                    maxLength={200}
                    required
                  />
                  <textarea
                    value={decisionNote}
                    onChange={(event) => setDecisionNote(event.target.value)}
                    onKeyDown={handleEnterToSend}
                    placeholder="Note (optional)"
                  />
                </div>
              ) : null}

              {composerMode === "task" ? (
                <div className="composer-grid">
                  <input
                    value={taskTitle}
                    onChange={(event) => setTaskTitle(event.target.value)}
                    placeholder="Task title"
                    maxLength={200}
                    required
                  />
                  <input
                    value={taskAssignee}
                    onChange={(event) => setTaskAssignee(event.target.value)}
                    placeholder="Assignee user id (optional)"
                  />
                </div>
              ) : null}

              <button type="submit">Send</button>
            </form>
          </>
        )}
      </main>

      {error ? <div className="error-banner">{error}</div> : null}
    </div>
  );
}
