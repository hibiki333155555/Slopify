# GitHub Integration Hooks: Design Direction

## Scope for current phase
This is design direction only. No GitHub-side mutating behavior is enabled in MVP.

## Proposed hook model
- Add event-to-hook mapping in sync-server after event persistence.
- Emit signed webhook payloads to a configured integration worker.
- Keep integration async and non-blocking so sync path stays fast.

## Suggested mappings
- `task.created` -> create GitHub Issue (optional project mapping)
- `task.completed` -> close linked Issue
- `decision.recorded` -> append comment to Issue / PR thread
- `doc.updated` -> open PR update flow (future)

## Data model hooks to add later
- Project-level GitHub settings (repo, default labels, auth reference)
- External link table:
  - `workspace_item_type` (`task`, `decision`, `doc`)
  - `workspace_item_id`
  - `provider` (`github`)
  - `external_id` (Issue/PR number)

## Security model
- Store GitHub tokens server-side only.
- Never expose OAuth tokens to Electron renderer.
- Use least-privilege GitHub App permissions.

## Failure model
- Hook failures must not fail local event commit.
- Retry with backoff via outbox table.
- Show integration status in future UI as non-blocking metadata.
