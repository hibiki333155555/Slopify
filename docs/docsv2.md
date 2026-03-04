# Project Log Desktop - Updated Requirements (v2)

This document is the single source of truth for the next implementation phase.
Follow it strictly.

If this document conflicts with the previous specification, this document takes priority.

---

## 1. Current Confirmed Baseline

The following is already implemented and must be preserved unless explicitly changed by this document:

- Monorepo structure with:
  - `apps/desktop`
  - `apps/sync-server`
  - `packages/shared`
- Desktop app built with Electron + React + TypeScript
- Local-first persistence using SQLite
- Event-sourced sync model
- Realtime sync server using Fastify + Socket.IO + PostgreSQL
- End-to-end runtime validation has already been completed for:
  - profile setup
  - project creation
  - message / decision / task posting
  - task complete / reopen
  - restart persistence
  - second client join and history hydration
  - realtime sync
  - offline sync after reconnect
- A DigitalOcean Ubuntu server is already prepared
- Docker has already been installed on the server

The existing local-first sync foundation is not to be removed.

---

## 2. Goal of This Phase

This phase is not a greenfield rewrite.
It is a productization and UX revision phase.

The immediate goals are:

1. Make the app easy for real users to download and start using
2. Replace the current overloaded UI with a cleaner product structure
3. Change the first-run flow to a server-based group onboarding flow
4. Add a proper user settings screen
5. Add a project workspace model with Chats and Docs
6. Define the required Docker deployment structure for the DigitalOcean server
7. Define GitHub integration as the next planned integration layer

---

## 3. Product Model Update

### 3.1 Server / Group Model

The app now assumes:

- **1 server = 1 group / workspace**
- Users are given the server connection info privately
- The server URL and server access password are provided out-of-band and must not be hard-coded in the repository

This replaces the previous assumption that the first collaborative entry point is project invite code.
Project invite code may remain internally if useful, but it is no longer the primary onboarding flow.

### 3.2 First-run Identity and Connection

On first launch, the user must see a setup screen with the following fields:

- Display name
- Avatar image (optional, but supported)
- Server URL
- Server access password

Behavior:

1. User enters the above values
2. App validates connection to the server
3. App stores the connection settings locally
4. App stores user profile locally
5. App opens the Project List screen

If connection fails, the app must show a clear error state and remain on the setup screen.

### 3.3 Existing Local-first Principle

The system must continue to be local-first:

- Local DB remains the primary store for the desktop app
- The app must still work with locally cached data when disconnected
- Sync continues to reconcile against the server when online

---

## 4. Distribution and User Setup Requirements

### 4.1 Default Distribution Method

The default user distribution method must be:

- **Download a prebuilt desktop installer or app bundle**
- Normal users should not be required to use `git clone`

Preferred distribution targets:

- macOS: `.dmg`
- Windows: `.exe`
- Linux: `.AppImage` (optional but desirable)

Temporary developer fallback:

- `git clone` + local run is allowed only for technical testers
- This is not the primary end-user path

### 4.2 Required User Setup Flow

The user-facing setup flow must be documented and supported exactly as follows:

1. Download the desktop app
2. Install or open the app
3. On first launch, enter:
   - display name
   - avatar (optional)
   - server URL (provided privately)
   - server access password (provided privately)
4. Click Connect / Continue
5. After successful connection, land on the Project List screen
6. Select an existing project or create a new project

### 4.3 Required Documentation Output

The repository must include an end-user setup guide that explains:

- how to download the app
- how to install the app
- what information is needed from the server operator
- how first launch works
- where to enter server URL and server access password

The guide must be written for non-technical users.

---

## 5. New UI Requirements

## 5.1 Global UX Principle

Do not put everything into one overloaded screen.

The app must be reorganized into:

1. Project List screen
2. Project Workspace screen
3. User Settings screen

The UI must stop exposing developer-oriented data in primary user views.

The following must **not** appear prominently in the normal UI:

- raw ULIDs
- raw event type strings such as `project.created` or `member.joined`
- database-style labels
- technical sync metadata

Technical details may exist in logs or debug views, but not in the main product UI.

---

## 5.2 Project List Screen (New Landing Screen)

This is the first main screen after successful connection.

Requirements:

- The main visual focus must be the vertically stacked project list
- The list should feel lightweight and direct, similar in spirit to a simple note index or Scrapbox-like list of pages
- Each project card / row should show only:
  - project name
  - unread count
- A prominent **Create Project** button must exist at the top of the same screen

Nice-to-have but secondary:

- project search
- project filtering

Do not overload each project card with extra metadata unless there is strong product value.

When the user clicks a project, the app must navigate to the Project Workspace screen.

---

## 5.3 Project Workspace Screen

The Project Workspace screen must use a two-pane layout.

### Left Pane

The left pane must contain:

- a **Chats** section
- a **Docs** section
- create buttons for each section

Rules:

- Users can create unlimited chat channels within a project
- Users can create unlimited docs within a project
- The left pane is for navigation only
- Keep it simple and scannable

### Right Pane

The right pane shows the content of the selected item.

If a chat is selected, show the Chat view.
If a doc is selected, show the Doc view.

---

## 5.4 Chat UX Requirements

Chat UX should be close to the mental model of Discord, but without unnecessary complexity.

Required behavior:

- Each chat channel has its own timeline
- Users must see avatar, display name, and timestamp for messages
- Consecutive messages from the same user should feel visually grouped
- Message composer lives at the bottom
- The chat list lives in the left pane under Chats

The current structured post types must still be supported:

- Message
- Decision
- Task
- System

These may appear as different card styles inside a chat timeline.

### Chat Composer

The composer must support:

- normal messages
- decisions
- tasks

The UX may use tabs, a dropdown, or a lightweight mode switch.
It must not feel developer-facing.

### Chat UI Anti-goals

Do not show:

- raw event names
- raw IDs
- implementation terminology
- internal status labels in the message stream

System events should be readable in human language.
Example:

- "Alice joined the project"
- "Task completed"

instead of:

- `member.joined`
- internal IDs

---

## 5.5 Docs UX Requirements

Each project must support multiple docs.

### Docs Basics

- Docs are stored as Markdown
- Users can create, rename, open, and edit docs
- Docs are listed in the left pane under Docs

### Doc View

The doc view must support:

- Markdown editing
- Markdown rendering / preview
- local save behavior consistent with the local-first model
- sync to server when online

### Comments on Docs

Docs must support comments.

For speed and simplicity, the initial version may use **document-level comments** instead of line-anchored comments.

Required behavior:

- Users can add comments to a doc
- Comments are shown in a dedicated comments area in the doc view
- Comments sync across users

### Doc UX Priority

Docs do not need a heavy wiki system.
They should remain lightweight Markdown documents with comments.

---

## 5.6 User Settings Screen

A dedicated user settings screen is required.

At minimum it must allow the user to manage:

- display name
- avatar image
- server URL
- reconnect action
- log out / clear saved server connection info

Optional but useful:

- local data directory path
- app version
- sync/debug status

---

## 5.7 First Screen Change

The first screen on a clean install must be the connection/profile setup screen, not the old project/invite-centered flow.

Required fields:

- display name
- server URL
- server access password
- avatar upload (optional)

After successful connection, the user must always land on the Project List screen.

---

## 6. Data Model and Sync Changes Required for the New UI

The current event-sourced architecture must be extended, not replaced.

### 6.1 New Core Entities

At minimum, the model must add support for:

- `chat_channels`
- `docs`
- `doc_comments`
- optionally `workspace_session` or equivalent local session storage

### 6.2 Updated Message Scoping

Chat messages, decisions, tasks, and system posts must now belong to a specific chat channel inside a project.

This means the event model must be extended so that relevant events can be scoped to:

- project
- chat channel
- doc

as appropriate.

### 6.3 Suggested Event Additions

The exact naming may vary, but the system must support the equivalent of:

- `chat.created`
- `chat.renamed`
- `message.posted` (scoped to a chat channel)
- `decision.recorded` (scoped to a chat channel)
- `task.created` (scoped to a chat channel)
- `task.completed` (scoped to a chat channel)
- `task.reopened` (scoped to a chat channel)
- `doc.created`
- `doc.renamed`
- `doc.updated`
- `doc.comment.added`

### 6.4 Backward Compatibility

Do not destroy the existing working sync system.
Adapt it so the same local-first, event-based sync model continues to work with channels and docs.

---

## 7. Server Authentication and Group Access

A lightweight server access model is required for immediate usability.

### Required behavior

- Server has a shared access password for the group
- Users enter that password on first launch
- Server validates it before allowing sync / workspace access
- Client stores the approved connection locally

### Simplicity requirement

This is intentionally lightweight.
Do not introduce a heavy account system unless absolutely required.

The primary purpose is:

- fast setup
- private group access
- one-server-one-group behavior

---

## 8. GitHub Integration (Planned Next Layer)

GitHub integration must be designed now and implemented as the next planned integration layer.
It is important, but it must not block the immediate usability and UI refresh work.

### Required design direction

Projects should be able to connect to Git repositories.

Desired integrations:

- repository link per project
- push notifications into chat
- pull request notifications into chat
- basic PR / push activity visibility

Good future direction:

- choose which chat channel receives GitHub notifications
- map one or more repos to one project

### Scope rule

Core installability, onboarding, project list, chats, docs, settings, and deployment are higher priority than GitHub integration.

---

## 9. Deployment Requirements for DigitalOcean

The deployment target is a DigitalOcean Ubuntu server.

### 9.1 Deployment Model

The server side must run with Docker.

Docker is for:

- `sync-server`
- `postgres`

Docker is **not** for the Electron desktop client.

### 9.2 Required Deployment Files in Repository

The repository must include:

- `apps/sync-server/Dockerfile`
- `docker-compose.yml`
- `.env.example`
- a short deployment guide for DigitalOcean

### 9.3 Docker Compose Requirements

The Docker deployment must be simple enough that the server operator can:

1. clone the repository on the VPS
2. create `.env` from `.env.example`
3. run `docker compose up -d --build`

PostgreSQL must not be exposed publicly.
Only the sync server port should be exposed.

### 9.4 Required Environment Variables

At minimum:

- `DATABASE_URL`
- `PORT`
- `SERVER_ACCESS_PASSWORD`
- optional public URL variable if needed by the app

### 9.5 Initial Private Deployment Rule

For immediate private testing, direct IP-based access is acceptable.
Example:

- `http://SERVER_IP:3000`

HTTPS and domain setup can come later.
Do not block initial rollout on TLS hardening.

---

## 10. Download and Install Guidance Requirements

The project must include documentation for both of the following:

### 10.1 End-user install guide

For normal users:

- where to download the desktop app
- how to install it
- how to get server URL and server access password from the operator
- how to connect on first launch

### 10.2 Operator deployment guide

For the server operator:

- how to set up the DigitalOcean droplet
- how to install Docker if not already installed
- how to clone the repository
- how to configure `.env`
- how to run `docker compose up -d --build`
- how to share server URL and password privately with users

These two guides must be separate and concise.

---

## 11. Acceptance Criteria for This Phase

This phase is complete when all of the following are true:

1. A normal user can download the desktop app without using `git clone`
2. On first launch, the app asks for:
   - display name
   - avatar (optional)
   - server URL
   - server access password
3. After successful connection, the app opens the Project List screen
4. The Project List screen shows a clean vertical list where each project mainly shows:
   - project name
   - unread count
5. Clicking a project opens a two-pane Project Workspace screen
6. The left pane contains:
   - Chats
   - Docs
   - create actions for both
7. Users can create multiple chat channels inside a project
8. Users can create multiple Markdown docs inside a project
9. Docs support comments
10. Chat UI shows human-readable messages with avatar, name, and timestamp
11. Raw IDs and raw event type labels are not shown in the normal UI
12. Existing local-first persistence and sync behavior still work
13. The repository contains Docker deployment files for the DigitalOcean server
14. The repository contains concise end-user install and operator deployment documentation

---

## 12. Out of Scope for This Phase

The following are not required in this phase unless they are low-effort and do not slow down the core work:

- full account system
- granular permissions
- complex doc collaboration features
- line-level inline comment anchoring
- kanban
- video / voice chat
- emoji reactions
- complex GitHub action controls
- enterprise auth
- production-grade infrastructure hardening

---

## 13. Implementation Priority Order

Implement in this order:

1. First-run connection/profile screen
2. Project List screen redesign
3. Project Workspace two-pane structure
4. Chat channel model and chat UI refresh
5. Docs model, Markdown docs, and doc comments
6. User Settings screen
7. Docker deployment files and deployment docs
8. End-user download/install docs
9. GitHub integration design hooks
10. Actual GitHub notification integration (only after the above)

---

## 14. Codex Execution Rule

This is a strict requirements update.

When implementing:

- preserve the working local-first sync foundation
- preserve the existing tested behavior unless explicitly replaced here
- do not rebuild everything from scratch unless necessary
- do not keep the old overloaded UI
- prioritize usability over developer-facing diagnostics in the main UI

