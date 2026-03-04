This document is the single source of truth for the project implementation.
Follow it strictly.

# Project Log Desktop — Full Specification (v1)

---

# 0. Foundational Assumptions

To keep the design consistent, the following constraints are fixed from the beginning.

## Product Definition

This application is:

**A local-first desktop application that stores conversations, decisions, and tasks as a single chronological history per project.**

It is not intended to replace document tools like Notion or chat tools like Discord.

Instead, it is designed to function as a **project history ledger**.

---

## Core Rules

* **1 Project = 1 Room**
* **1 Room = 1 Timeline**
* Post types are limited to **Message / Decision / Task / System**
* **History is never deleted**
* **Local persistence is always primary**
* Online synchronization occurs only when users are connected
* **No channels, threads, wiki, or kanban boards**

These rules prevent complexity from growing uncontrollably.

---

## Technology Stack

Recommended minimal architecture:

Desktop Application

* Electron
* React
* TypeScript

State Management

* Zustand (UI state only)

Validation

* Zod

Local Database

* SQLite
* better-sqlite3

ORM / Schema

* Drizzle ORM

Realtime Sync Server

* Fastify
* Socket.IO

Server Database

* PostgreSQL

---

## TypeScript Monorepo Structure

To share types between client and server:

```
apps/
  desktop/
    src/
      main/        # Electron main process
      preload/     # IPC bridge
      renderer/    # React UI
  sync-server/
    src/

packages/
  shared/
    src/
      schema/      # Zod schemas / event types
      db/          # shared query types
```

---

## Electron Responsibility Separation

Proper separation is critical.

Renderer

* UI rendering
* user interaction
* temporary UI state

Main Process

* SQLite database access
* synchronization
* file export
* IPC service layer

Preload

* typed API bridge exposed to the renderer

Renderer **never accesses the database directly**.

---

# 1. Screen List

The application contains approximately **6 screens**, implemented within a single window.

---

# 1.1 First Launch Screen (Profile Setup)

### Purpose

Create the local user identity.

### Input

* Display name (required)

### Internal Initialization

* generate `local_user_id`
* generate `local_device_id`
* insert into `users` table
* store metadata in `app_meta`
* initialize database schema if necessary

### UI Elements

* application title
* display name input
* "Start" button

### Design Decision

No email login for MVP.

**1 installation = 1 user identity**

This avoids building a heavy authentication system.

---

# 1.2 Project List Screen

This is the application's home screen.

### Information Displayed

Each project shows:

* project name
* description (single line)
* status
* unread count
* last updated time
* number of online members (if connected)

### UI Layout

Top Section

* Create Project button
* Join with Invite Code button
* search bar

Project List

Filter tabs:

* active
* paused
* done
* archived

Bottom

* settings button

### Sorting

```
ORDER BY updated_at DESC
```

### Empty State

```
No projects yet
Create your first project
Join with an invite code
```

### Context Actions

Right-click or menu:

* archive
* export JSON
* export Markdown

---

# 1.3 Create Project Modal

### Inputs

* Project name (required, max 100 characters)
* Description (optional, max 200 characters)
* Status (default: active)

### Creation Process

1. insert into `projects`
2. add current user to `project_members` as owner
3. create `project.created` event
4. navigate to project room

### Validation

* name cannot be empty
* duplicate names allowed
* enforce length limits

---

# 1.4 Project Room Screen

This is the **primary working interface**.

### Layout

Left panel

* project list sidebar

Center panel

* project timeline

Right panel

* intentionally **not implemented**

Right panels tend to increase complexity and are avoided.

---

## Header Section

Displays:

* project name
* description
* status
* member list
* currently online members
* latest decisions (1–3)
* open task count
* invite button
* export button

---

## Timeline

Mixed chronological display of:

* Message
* Decision
* Task
* System

---

## Filters

* All
* Message
* Decision
* Task
* Open Tasks

---

## Timeline Rendering Rules

* grouped by date
* load newest 100 events
* infinite scroll loads older events
* order: oldest → newest
* user messages visually differentiated
* Decision cards highlighted
* Task entries show checkbox style
* System events displayed with subdued color

---

## Input Box

Single input area at the bottom.

### Input Modes

* Message
* Decision
* Task

### Message Input

* message body (required)

### Decision Input

* decision title (required)
* note (optional)

### Task Input

* task title (required)
* assignee (optional)

### Interaction

Enter → send
Shift + Enter → newline

After submission

* clear input
* save locally immediately

---

## Post Actions

Message

* no edit or delete in MVP

Decision

* immutable

Task

* mark complete
* reopen

---

## Unread Logic

When user scrolls to bottom:

```
update last_read_seq
```

Unread counts ignore the user's own events.

---

# 1.5 Invite / Join Modal

### Purpose

Allow friends to join projects.

### Inviting

* generate invite code
* copy code
* show expiration (ex: 7 days)

### Joining

* input invite code
* join button

### Join Process

Server returns:

* project
* members
* event history

Client stores locally.

Event created:

```
member.joined
```

### MVP Simplification

Invite codes only.

No complex link-based authentication.

---

# 1.6 Settings Screen

### Displays

* display name
* data directory
* server URL
* connection status
* schema version
* application version

### Operations

* change display name
* change server URL
* reconnect
* database backup
* view logs

### Not Included

* theme settings
* granular notifications
* role management
* account systems

---

# 2. Domain Model

The core concept:

**events are the source of truth**

`tasks` and `decisions` tables exist only as projections.

---

## Entities

* User
* Project
* ProjectMember
* Event
* Task
* Decision
* ReadCursor
* ProjectSyncState

---

## ID Format

Use **ULID** everywhere.

Advantages:

* sortable
* generated offline
* globally unique

---

## Time Format

All timestamps stored as:

```
Unix epoch milliseconds (INTEGER)
```

---

## Event Types

```
project.created
project.updated
member.joined
member.left
message.posted
decision.recorded
task.created
task.completed
task.reopened
```

---

## Example Event Payload

Message

```
{
  "eventType": "message.posted",
  "payload": {
    "body": "Let's start with Electron."
  }
}
```

Decision

```
{
  "eventType": "decision.recorded",
  "payload": {
    "decisionId": "01JXXX...",
    "summary": "Use Electron for v1",
    "note": "Consider Tauri later"
  }
}
```

Task Created

```
{
  "eventType": "task.created",
  "payload": {
    "taskId": "01JYYY...",
    "title": "Build project list UI",
    "assigneeUserId": "01JUSER..."
  }
}
```

Task Completed

```
{
  "eventType": "task.completed",
  "payload": {
    "taskId": "01JYYY..."
  }
}
```

---

# 3. Database Schema

The local SQLite database is the application's core.

(Exact SQL retained)

```sql
PRAGMA foreign_keys = ON;

CREATE TABLE app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

Keys used:

* schema_version
* local_user_id
* local_device_id
* server_url

---

## Users

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

---

## Projects

```sql
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('active','paused','done','archived')),
  owner_user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  archived_at INTEGER
);
```

---

## Members

```sql
CREATE TABLE project_members (
  project_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner','member')),
  joined_at INTEGER NOT NULL,
  left_at INTEGER,
  PRIMARY KEY (project_id,user_id)
);
```

---

## Events

```sql
CREATE TABLE events (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  seq INTEGER,
  actor_user_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  entity_id TEXT,
  payload_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  server_created_at INTEGER,
  sync_status TEXT NOT NULL DEFAULT 'pending',
  retry_count INTEGER NOT NULL DEFAULT 0
);
```

Events represent the immutable history.

---

## Decisions

Projection table for decision events.

```sql
CREATE TABLE decisions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_event_id TEXT NOT NULL UNIQUE,
  created_by_user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
```

---

## Tasks

Projection table for task state.

```sql
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  assignee_user_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('open','done')),
  created_event_id TEXT NOT NULL UNIQUE,
  created_by_user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  completed_at INTEGER,
  completed_by_user_id TEXT
);
```

---

## Read Cursor

Tracks unread state.

```sql
CREATE TABLE read_cursors (
  project_id TEXT PRIMARY KEY,
  last_read_seq INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

---

## Sync State

```sql
CREATE TABLE project_sync_state (
  project_id TEXT PRIMARY KEY,
  last_pulled_seq INTEGER NOT NULL,
  last_sync_at INTEGER,
  last_error TEXT
);
```

---

# 4. Synchronization Model

The guiding principle:

**Local-first event logging.**

---

## Posting Flow

1. UI receives input
2. send command to main process
3. write event to SQLite
4. update projections
5. update project timestamp
6. render UI
7. push to server if connected

---

## Event Immutability

MVP rules:

* no message editing
* no message deletion
* no decision editing
* no decision deletion
* tasks only change open/done

All changes occur through **new events**.

---

## Task State Updates

Task Created

```
status = open
```

Task Completed

```
status = done
```

Task Reopened

```
status = open
```

Conflict resolution:

**latest server sequence wins**

---

## Timeline Ordering

Display order:

```
seq ASC
```

Unsynced events use:

```
created_at ASC
```

---

## Unread Count

Computed as:

```
events.seq > last_read_seq
AND actor_user_id != local_user_id
```

---

## Reconnect Synchronization

Client stores:

```
last_pulled_seq
```

On reconnect:

```
request events since last_pulled_seq
```

Server returns missing events.

---

## Idempotency

Each event uses a globally unique ID.

Duplicate insert attempts are ignored.

---

# 5. Renderer IPC API

Typed API exposed through preload.

Example:

```
projects.list()
projects.create()
timeline.postMessage()
timeline.createTask()
timeline.completeTask()
invite.create()
sync.connect()
settings.exportProject()
```

(Full interface preserved from the original design.)

---

# 6. MVP Development Phases

## Phase 0 — Foundation

* Electron setup
* SQLite connection
* IPC layer
* shared schemas

Success condition:

Application launches and database is accessible.

---

## Phase 1 — Local-Only Version

Implement:

* profile setup
* project list
* project creation
* room UI
* message posting
* decision posting
* task creation
* task completion

Success condition:

Application usable offline as a solo project log.

---

## Phase 2 — UX Completion

Add:

* filters
* project editing
* status changes
* export features
* unread counts
* pagination
* settings UI

Success condition:

usable as a full single-user project history tool.

---

## Phase 3 — Online Sync

Implement:

* sync server
* event push
* event ack
* event broadcast
* invite codes
* presence tracking

Success condition:

two clients can collaborate in real time.

---

## Phase 4 — Stability

Add:

* retry logic
* error logging
* database backup
* migrations
* improved exports

Success condition:

system stable for daily use.

---

# 7. Feature Decision Rule

New features must pass this question:

**Does this strengthen the project history ledger?**

If not, it should not be included.

---

## Allowed Future Additions

* search
* task deadlines
* pinning
* attachments
* AI summaries

---

## Not Allowed in v1

* channels
* threads
* wiki pages
* kanban boards
* gantt charts
* voice chat
* video chat
* emoji reactions
* complex permissions

---

# 8. Acceptance Criteria

The system is considered complete when:

* a new project can be created within 10 seconds
* messages, decisions, and tasks coexist in one timeline
* task completion generates history events
* data persists after application restart
* offline posts synchronize after reconnect
* remote messages arrive within seconds
* latest decisions and open task counts are visible immediately

---

# 9. Non-Functional Requirements

* offline history browsing supported
* application restart does not lose data
* handles hundreds of projects
* supports tens of thousands of events per project
* database backup allows recovery

---

# 10. Security Assumptions

* invite-code based authentication
* TLS communication
* minimal access control
* local encryption optional in future versions
* device tokens stored via OS keychain in future versions
