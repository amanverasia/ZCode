/* eslint-disable max-lines */
import { access, mkdir, stat } from "node:fs/promises";
import { dirname } from "node:path";
import type {
  GitCreateWorktreeRequest,
  GitRemoveWorktreeRequest,
  GitWorktreeEntry,
  GitWorktreeListResult,
  GitWorktreeMutationResult,
} from "@zcode/shared";
import {
  DEFAULT_GIT_COMMAND_TIMEOUT_MS,
  DEFAULT_GIT_OUTPUT_BYTES,
} from "#src/git/config.js";
import type { GitCommandProvider } from "../providers/gitCommandProvider.js";
import {
  ensureGitCommandSucceeded,
  ensureRepositoryAvailable,
} from "./gitCliHelpers.js";
import type { GitResolvedRepository } from "./gitCliTypes.js";
import {
  isValidWorktreeName,
  normalizeComparablePath,
  parseGitWorktreeMutationIssues,
  parseWorktreeListPorcelain,
  pathsReferToSameDirectory,
  resolveMainTreePathFromCommonDir,
  resolveRequestedWorktreePath,
  sanitizeWorktreeName,
  toGitWorktreeEntries,
  toWorktreeMutationIssue,
} from "./gitWorktreeHelpers.js";

export interface GitWorktreeOpsContext {
  commandProvider: GitCommandProvider;
  resolveRepository: (workspacePath: string) => Promise<GitResolvedRepository>;
  invalidate: (workspacePath: string) => void;
}

const NUL = String.fromCharCode(0);

async function resolveGitCommonDir(
  ctx: GitWorktreeOpsContext,
  resolution: GitResolvedRepository,
): Promise<string> {
  const result = await ctx.commandProvider.run({
    cwd: resolution.repoRoot,
    args: ["rev-parse", "--path-format=absolute", "--git-common-dir"],
    timeoutMs: DEFAULT_GIT_COMMAND_TIMEOUT_MS,
    maxOutputBytes: DEFAULT_GIT_OUTPUT_BYTES,
  });
  ensureGitCommandSucceeded("git rev-parse --git-common-dir", result);
  const commonDir = result.stdout.trim();
  if (!commonDir) {
    throw new Error("Failed to resolve Git common directory");
  }
  return commonDir;
}

async function probeWorktreeDirty(
  ctx: GitWorktreeOpsContext,
  worktreePath: string,
): Promise<boolean> {
  const result = await ctx.commandProvider.run({
    cwd: worktreePath,
    args: ["status", "--porcelain", "-z", "--untracked-files=normal"],
    timeoutMs: DEFAULT_GIT_COMMAND_TIMEOUT_MS,
    maxOutputBytes: DEFAULT_GIT_OUTPUT_BYTES,
  });
  if (result.exitCode !== 0) {
    // Missing / broken worktree: treat as dirty so remove stays conservative.
    return true;
  }
  return result.stdout.split(NUL).join("").trim().length > 0;
}

async function loadWorktreeEntries(
  ctx: GitWorktreeOpsContext,
  resolution: GitResolvedRepository,
): Promise<{ mainTreePath: string; worktrees: GitWorktreeEntry[] }> {
  const commonDir = await resolveGitCommonDir(ctx, resolution);
  const mainTreePath = resolveMainTreePathFromCommonDir(commonDir);

  const listResult = await ctx.commandProvider.run({
    cwd: resolution.repoRoot,
    args: ["worktree", "list", "--porcelain"],
    timeoutMs: DEFAULT_GIT_COMMAND_TIMEOUT_MS,
    maxOutputBytes: DEFAULT_GIT_OUTPUT_BYTES,
  });
  ensureGitCommandSucceeded("git worktree list", listResult);

  const drafts = parseWorktreeListPorcelain(listResult.stdout);
  const dirtyByPath = new Map<string, boolean>();
  await Promise.all(
    drafts.map(async (draft) => {
      const dirty = await probeWorktreeDirty(ctx, draft.path);
      dirtyByPath.set(normalizeComparablePath(draft.path), dirty);
    }),
  );

  return {
    mainTreePath: drafts[0]?.path ?? mainTreePath,
    worktrees: toGitWorktreeEntries({
      drafts,
      currentWorktreePath: resolution.repoRoot,
      dirtyByPath,
    }),
  };
}

function toMutationFailure(params: {
  action: GitWorktreeMutationResult["action"];
  path: string | null;
  branchName: string | null;
  worktrees: GitWorktreeEntry[];
  issues: GitWorktreeMutationResult["issues"];
}): GitWorktreeMutationResult {
  return {
    ok: false,
    action: params.action,
    path: params.path,
    branchName: params.branchName,
    didChange: false,
    worktrees: params.worktrees,
    issues: params.issues,
  };
}

function toMutationSuccess(params: {
  action: GitWorktreeMutationResult["action"];
  path: string;
  branchName: string | null;
  worktrees: GitWorktreeEntry[];
}): GitWorktreeMutationResult {
  return {
    ok: true,
    action: params.action,
    path: params.path,
    branchName: params.branchName,
    didChange: true,
    worktrees: params.worktrees,
    issues: [],
  };
}

export async function listGitWorktrees(
  ctx: GitWorktreeOpsContext,
  workspacePath: string,
): Promise<GitWorktreeListResult> {
  const resolution = await ctx.resolveRepository(workspacePath);
  if (!resolution.isGitAvailable || !resolution.isRepository) {
    return {
      workspacePath,
      mainTreePath: null,
      worktrees: [],
    };
  }

  ensureRepositoryAvailable(resolution, "list worktrees");
  const loaded = await loadWorktreeEntries(ctx, resolution);
  return {
    workspacePath,
    mainTreePath: loaded.mainTreePath,
    worktrees: loaded.worktrees,
  };
}

export async function createGitWorktree(
  ctx: GitWorktreeOpsContext,
  params: GitCreateWorktreeRequest,
): Promise<GitWorktreeMutationResult> {
  const resolution = await ctx.resolveRepository(params.workspacePath);
  ensureRepositoryAvailable(resolution, "create worktree");
  const loadedBefore = await loadWorktreeEntries(ctx, resolution);

  const name = sanitizeWorktreeName(params.name);
  if (!isValidWorktreeName(name)) {
    return toMutationFailure({
      action: "create",
      path: null,
      branchName: params.branchName?.trim() || null,
      worktrees: loadedBefore.worktrees,
      issues: [
        toWorktreeMutationIssue(
          "invalid-worktree-name",
          "Worktree name is invalid.",
        ),
      ],
    });
  }

  const branchName = sanitizeWorktreeName(params.branchName?.trim() || name);
  if (!isValidWorktreeName(branchName)) {
    return toMutationFailure({
      action: "create",
      path: null,
      branchName,
      worktrees: loadedBefore.worktrees,
      issues: [
        toWorktreeMutationIssue("invalid-worktree-name", "Branch name is invalid."),
      ],
    });
  }

  const targetPath = resolveRequestedWorktreePath({
    workspacePath: params.workspacePath,
    mainTreePath: loadedBefore.mainTreePath,
    name,
    path: params.path,
  });

  try {
    await access(targetPath);
    return toMutationFailure({
      action: "create",
      path: targetPath,
      branchName,
      worktrees: loadedBefore.worktrees,
      issues: [
        toWorktreeMutationIssue(
          "path-already-exists",
          "Worktree path already exists.",
          targetPath,
          [targetPath],
        ),
      ],
    });
  } catch {
    // Path does not exist — continue.
  }

  await mkdir(dirname(targetPath), { recursive: true });

  const createBranch = params.createBranch !== false;
  const startPoint = params.startPoint?.trim();
  const args = ["worktree", "add"];
  if (createBranch) {
    args.push("-b", branchName);
  }
  args.push(targetPath);
  if (createBranch && startPoint) {
    args.push(startPoint);
  } else if (!createBranch) {
    args.push(branchName);
  }

  const result = await ctx.commandProvider.run({
    cwd: resolution.repoRoot,
    args,
    timeoutMs: DEFAULT_GIT_COMMAND_TIMEOUT_MS,
    maxOutputBytes: DEFAULT_GIT_OUTPUT_BYTES,
  });

  if (result.exitCode !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim() || null;
    return toMutationFailure({
      action: "create",
      path: targetPath,
      branchName,
      worktrees: loadedBefore.worktrees,
      issues: parseGitWorktreeMutationIssues(detail),
    });
  }

  ctx.invalidate(params.workspacePath);
  ctx.invalidate(targetPath);
  const loadedAfter = await loadWorktreeEntries(ctx, resolution);
  return toMutationSuccess({
    action: "create",
    path: targetPath,
    branchName,
    worktrees: loadedAfter.worktrees,
  });
}

export async function removeGitWorktree(
  ctx: GitWorktreeOpsContext,
  params: GitRemoveWorktreeRequest,
): Promise<GitWorktreeMutationResult> {
  const resolution = await ctx.resolveRepository(params.workspacePath);
  ensureRepositoryAvailable(resolution, "remove worktree");
  const loadedBefore = await loadWorktreeEntries(ctx, resolution);

  const targetPath = params.path.trim();
  if (!targetPath) {
    return toMutationFailure({
      action: "remove",
      path: null,
      branchName: null,
      worktrees: loadedBefore.worktrees,
      issues: [
        toWorktreeMutationIssue("worktree-not-found", "Worktree path is required."),
      ],
    });
  }

  const target = loadedBefore.worktrees.find((entry) =>
    pathsReferToSameDirectory(entry.path, targetPath),
  );
  if (!target) {
    return toMutationFailure({
      action: "remove",
      path: targetPath,
      branchName: null,
      worktrees: loadedBefore.worktrees,
      issues: [
        toWorktreeMutationIssue(
          "worktree-not-found",
          "Worktree was not found in this repository.",
          targetPath,
          [targetPath],
        ),
      ],
    });
  }

  if (target.isMain) {
    return toMutationFailure({
      action: "remove",
      path: target.path,
      branchName: target.branchName,
      worktrees: loadedBefore.worktrees,
      issues: [
        toWorktreeMutationIssue(
          "main-worktree-protected",
          "The main worktree cannot be removed.",
          target.path,
          [target.path],
        ),
      ],
    });
  }

  if (target.isCurrent) {
    return toMutationFailure({
      action: "remove",
      path: target.path,
      branchName: target.branchName,
      worktrees: loadedBefore.worktrees,
      issues: [
        toWorktreeMutationIssue(
          "current-worktree-protected",
          "Cannot remove the worktree that is currently open.",
          target.path,
          [target.path],
        ),
      ],
    });
  }

  const force = params.force === true;
  if (!force && target.isDirty) {
    return toMutationFailure({
      action: "remove",
      path: target.path,
      branchName: target.branchName,
      worktrees: loadedBefore.worktrees,
      issues: [
        toWorktreeMutationIssue(
          "dirty-worktree",
          "Worktree has uncommitted changes. Commit, stash, or confirm force remove.",
          target.path,
          [target.path],
        ),
      ],
    });
  }

  // Extra filesystem probe so we never race past a dirty tree even if list cache drifted.
  if (!force) {
    const stillDirty = await probeWorktreeDirty(ctx, target.path);
    if (stillDirty) {
      return toMutationFailure({
        action: "remove",
        path: target.path,
        branchName: target.branchName,
        worktrees: loadedBefore.worktrees,
        issues: [
          toWorktreeMutationIssue(
            "dirty-worktree",
            "Worktree has uncommitted changes. Commit, stash, or confirm force remove.",
            target.path,
            [target.path],
          ),
        ],
      });
    }
  }

  try {
    const targetStat = await stat(target.path);
    if (!targetStat.isDirectory()) {
      return toMutationFailure({
        action: "remove",
        path: target.path,
        branchName: target.branchName,
        worktrees: loadedBefore.worktrees,
        issues: [
          toWorktreeMutationIssue(
            "worktree-not-found",
            "Worktree path is not a directory.",
            target.path,
            [target.path],
          ),
        ],
      });
    }
  } catch {
    return toMutationFailure({
      action: "remove",
      path: target.path,
      branchName: target.branchName,
      worktrees: loadedBefore.worktrees,
      issues: [
        toWorktreeMutationIssue(
          "worktree-not-found",
          "Worktree path no longer exists.",
          target.path,
          [target.path],
        ),
      ],
    });
  }

  const args = ["worktree", "remove"];
  if (force) {
    args.push("--force");
  }
  args.push(target.path);

  const result = await ctx.commandProvider.run({
    cwd: resolution.repoRoot,
    args,
    timeoutMs: DEFAULT_GIT_COMMAND_TIMEOUT_MS,
    maxOutputBytes: DEFAULT_GIT_OUTPUT_BYTES,
  });

  if (result.exitCode !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim() || null;
    return toMutationFailure({
      action: "remove",
      path: target.path,
      branchName: target.branchName,
      worktrees: loadedBefore.worktrees,
      issues: parseGitWorktreeMutationIssues(detail),
    });
  }

  ctx.invalidate(params.workspacePath);
  ctx.invalidate(target.path);
  const loadedAfter = await loadWorktreeEntries(ctx, resolution);
  return toMutationSuccess({
    action: "remove",
    path: target.path,
    branchName: target.branchName,
    worktrees: loadedAfter.worktrees,
  });
}
