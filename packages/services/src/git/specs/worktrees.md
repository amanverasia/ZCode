# Native Git worktrees

## Goal

Expose create / list / switch / remove for linked Git worktrees as a first-class `IGitService` capability so agents and UI no longer depend on bash `git worktree` fallbacks (feedback #220 / #132).

## Ownership

- **Owner:** `packages/services/src/git` (`IGitService` + `GitCliRepo`)
- **UI:** reads via `IGitService`; switch opens another workspace path (does not `git switch` inside one tree)
- **No second source of truth:** worktree facts come from `git worktree list --porcelain` (+ per-tree dirty probe)

## Behaviors

### List

- Return every worktree for the repository that contains `workspacePath`
- Mark `isMain`, `isCurrent` (path equals current worktree root), branch/HEAD, lock/prunable flags, and `isDirty`

### Create

- Default path: `<main-tree>/.worktrees/<name>`
- Default branch: `name` (create with `-b` unless `createBranch: false`)
- Optional `startPoint` (defaults to current HEAD)
- Reject empty / invalid names; surface structured issues (path exists, branch in other worktree, etc.)

### Switch

- Not a Git mutation: UI opens the selected worktree path as a workspace (tab activate / add)
- Service only lists/creates/removes; switching is workspace navigation

### Remove

- Never silently delete dirty worktrees
- Default `force: false`: if the target has uncommitted changes (tracked or untracked), return `dirty-worktree` and do not call `git worktree remove`
- `force: true` only after explicit user confirmation in UI
- Refuse removing the main worktree and the currently open worktree

## Failure semantics

Structured `GitWorktreeMutationResult.issues[]` with stable codes (not raw stderr alone). UI maps codes to i18n.

## Out of scope (this slice)

- Automatic agent binding / parallel-mode defaults
- Prune UI for stale worktrees
- Deleting the associated branch on remove
