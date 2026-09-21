import type { GitWorktreeEntry, GitWorktreeMutationIssue } from "@zcode/shared";

export function resolveGitWorktreeTriggerLabel(params: {
  current: GitWorktreeEntry | null;
  fallbackLabel: string;
  mainLabel: string;
}): string {
  if (!params.current) {
    return params.fallbackLabel;
  }
  if (params.current.isMain) {
    return params.current.branchName
      ? `${params.mainLabel} · ${params.current.branchName}`
      : params.mainLabel;
  }
  const folder = params.current.path.replace(/\\/g, "/").split("/").filter(Boolean).at(-1);
  return params.current.branchName || folder || params.fallbackLabel;
}

export function resolveGitWorktreeIssueMessageId(
  issue: GitWorktreeMutationIssue | null | undefined,
): string {
  switch (issue?.code) {
    case "invalid-worktree-name":
      return "git.worktreeSwitcher.error.invalidName";
    case "path-already-exists":
      return "git.worktreeSwitcher.error.pathExists";
    case "branch-already-exists":
      return "git.worktreeSwitcher.error.branchExists";
    case "branch-in-other-worktree":
      return "git.worktreeSwitcher.error.branchInOtherWorktree";
    case "dirty-worktree":
      return "git.worktreeSwitcher.error.dirty";
    case "main-worktree-protected":
      return "git.worktreeSwitcher.error.mainProtected";
    case "current-worktree-protected":
      return "git.worktreeSwitcher.error.currentProtected";
    case "worktree-not-found":
      return "git.worktreeSwitcher.error.notFound";
    case "operation-in-progress":
      return "git.worktreeSwitcher.error.operationInProgress";
    default:
      return "git.worktreeSwitcher.error.unknown";
  }
}

export function getPrimaryGitWorktreeIssue(
  issues: readonly GitWorktreeMutationIssue[],
): GitWorktreeMutationIssue | null {
  return issues[0] ?? null;
}

export function matchesGitWorktreeSearch(entry: GitWorktreeEntry, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return true;
  }
  const haystack = `${entry.branchName ?? ""} ${entry.path}`.toLowerCase();
  return haystack.includes(normalized);
}
