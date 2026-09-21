import { isAbsolute, relative, resolve, sep } from "node:path";
import type {
  GitHeadRefType,
  GitWorktreeEntry,
  GitWorktreeMutationIssue,
  GitWorktreeMutationIssueCode,
} from "@zcode/shared";

export function sanitizeWorktreeName(name: string): string {
  return name
    .trim()
    .replace(/\\/g, "/")
    .replace(/\/+/g, "/")
    .replace(/^\/+|\/+$/g, "");
}

export function isValidWorktreeName(name: string): boolean {
  if (name.length === 0 || name.length > 200) {
    return false;
  }
  if (name === "." || name === ".." || name.includes("..")) {
    return false;
  }
  // Folder segment under `.worktrees/` — keep it branch-like and path-safe.
  return /^[A-Za-z0-9._][A-Za-z0-9._/-]*$/.test(name) && !name.endsWith("/");
}

export function resolveMainTreePathFromCommonDir(gitCommonDir: string): string {
  const normalized = gitCommonDir.replace(/\\/g, "/").replace(/\/+$/, "");
  if (normalized.endsWith("/.git")) {
    return normalized.slice(0, -"/.git".length) || "/";
  }
  // Bare / separate git-dir: parent of common dir is the best stable anchor we have.
  const lastSlash = normalized.lastIndexOf("/");
  return lastSlash > 0 ? normalized.slice(0, lastSlash) : normalized;
}

export function resolveDefaultWorktreePath(mainTreePath: string, name: string): string {
  return resolve(mainTreePath, ".worktrees", ...name.split("/"));
}

export function resolveRequestedWorktreePath(params: {
  workspacePath: string;
  mainTreePath: string;
  name: string;
  path?: string;
}): string {
  const override = params.path?.trim();
  if (!override) {
    return resolveDefaultWorktreePath(params.mainTreePath, params.name);
  }
  if (isAbsolute(override)) {
    return override;
  }
  return resolve(params.workspacePath, ...override.split(/[/\\]/).filter(Boolean));
}

export function normalizeComparablePath(path: string): string {
  const normalized = path.replace(/\\/g, "/").replace(/\/+$/, "");
  return normalized.length > 0 ? normalized : "/";
}

export function pathsReferToSameDirectory(left: string, right: string): boolean {
  return normalizeComparablePath(left) === normalizeComparablePath(right);
}

export function toWorktreeMutationIssue(
  code: GitWorktreeMutationIssueCode,
  message: string,
  detail?: string | null,
  paths?: string[],
): GitWorktreeMutationIssue {
  return {
    code,
    message,
    detail: detail?.trim() || null,
    ...(paths && paths.length > 0 ? { paths } : {}),
  };
}

export function parseGitWorktreeMutationIssues(detail: string | null): GitWorktreeMutationIssue[] {
  const normalized = detail?.toLowerCase() ?? "";
  if (!detail) {
    return [
      toWorktreeMutationIssue("unknown", "Git could not complete the worktree operation."),
    ];
  }

  if (normalized.includes("already exists") && normalized.includes("branch")) {
    return [
      toWorktreeMutationIssue(
        "branch-already-exists",
        "Branch already exists.",
        detail,
      ),
    ];
  }

  if (normalized.includes("already exists")) {
    return [
      toWorktreeMutationIssue(
        "path-already-exists",
        "Worktree path already exists.",
        detail,
      ),
    ];
  }

  if (normalized.includes("is already used by worktree at") || normalized.includes("checked out at")) {
    return [
      toWorktreeMutationIssue(
        "branch-in-other-worktree",
        "Branch is already checked out in another worktree.",
        detail,
      ),
    ];
  }

  if (normalized.includes("is a main working tree") || normalized.includes("is not a working tree")) {
    return [
      toWorktreeMutationIssue(
        "main-worktree-protected",
        "The main worktree cannot be removed this way.",
        detail,
      ),
    ];
  }

  if (
    normalized.includes("contains modified or untracked files") ||
    normalized.includes("is dirty")
  ) {
    return [
      toWorktreeMutationIssue(
        "dirty-worktree",
        "Worktree has uncommitted changes.",
        detail,
      ),
    ];
  }

  return [
    toWorktreeMutationIssue(
      "unknown",
      "Git could not complete the worktree operation.",
      detail,
    ),
  ];
}

interface PorcelainWorktreeDraft {
  path: string;
  head: string | null;
  branchName: string | null;
  headRefType: GitHeadRefType;
  isLocked: boolean;
  lockReason: string | null;
  isPrunable: boolean;
}

/**
 * Parse `git worktree list --porcelain` into draft entries (dirty/current filled by caller).
 */
export function parseWorktreeListPorcelain(stdout: string): PorcelainWorktreeDraft[] {
  const lines = stdout.replace(/\r\n/g, "\n").split("\n");
  const drafts: PorcelainWorktreeDraft[] = [];
  let current: PorcelainWorktreeDraft | null = null;

  const flush = () => {
    if (current?.path) {
      drafts.push(current);
    }
    current = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (line.length === 0) {
      flush();
      continue;
    }

    if (line.startsWith("worktree ")) {
      flush();
      current = {
        path: line.slice("worktree ".length),
        head: null,
        branchName: null,
        headRefType: "detached",
        isLocked: false,
        lockReason: null,
        isPrunable: false,
      };
      continue;
    }

    if (!current) {
      continue;
    }

    if (line.startsWith("HEAD ")) {
      current.head = line.slice("HEAD ".length).trim() || null;
      continue;
    }

    if (line.startsWith("branch ")) {
      const ref = line.slice("branch ".length).trim();
      current.headRefType = "branch";
      current.branchName = ref.startsWith("refs/heads/")
        ? ref.slice("refs/heads/".length)
        : ref;
      continue;
    }

    if (line === "detached") {
      current.headRefType = "detached";
      current.branchName = null;
      continue;
    }

    if (line === "bare") {
      continue;
    }

    if (line.startsWith("locked")) {
      current.isLocked = true;
      const reason = line.slice("locked".length).trim();
      current.lockReason = reason.length > 0 ? reason : null;
      continue;
    }

    if (line === "prunable") {
      current.isPrunable = true;
    }
  }

  flush();
  return drafts;
}

export function toGitWorktreeEntries(params: {
  drafts: PorcelainWorktreeDraft[];
  currentWorktreePath: string;
  dirtyByPath: Map<string, boolean>;
}): GitWorktreeEntry[] {
  const mainPath = params.drafts[0]?.path ?? null;
  return params.drafts.map((draft) => {
    const isMain = mainPath
      ? pathsReferToSameDirectory(draft.path, mainPath)
      : false;
    return {
      path: draft.path,
      head: draft.head,
      branchName: draft.branchName,
      headRefType: draft.headRefType,
      isMain,
      isCurrent: pathsReferToSameDirectory(draft.path, params.currentWorktreePath),
      isLocked: draft.isLocked,
      lockReason: draft.lockReason,
      isPrunable: draft.isPrunable,
      isDirty: params.dirtyByPath.get(normalizeComparablePath(draft.path)) ?? false,
    };
  });
}

export function worktreePathLooksInsideRepo(params: {
  mainTreePath: string;
  worktreePath: string;
}): boolean {
  const relativePath = relative(params.mainTreePath, params.worktreePath);
  if (!relativePath || relativePath === ".") {
    return true;
  }
  // Allow sibling `.worktrees` under main tree; reject escaping to unrelated drives/parents
  // only when the resolved relative path climbs out with `..` segments outside common layouts.
  const normalized = relativePath.split(sep).join("/");
  return !normalized.startsWith("../") && normalized !== "..";
}
