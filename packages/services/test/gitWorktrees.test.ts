import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";
import { createGitCliRepo } from "../src/git/repo/gitCliRepo.js";
import {
  isValidWorktreeName,
  parseWorktreeListPorcelain,
  pathsReferToSameDirectory,
  resolveDefaultWorktreePath,
  sanitizeWorktreeName,
} from "../src/git/repo/gitWorktreeHelpers.js";

async function runGit(cwd: string, args: string[]): Promise<string> {
  return await new Promise((resolvePromise, reject) => {
    const child = spawn("git", args, {
      cwd,
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: "ZCode Worktree Test",
        GIT_AUTHOR_EMAIL: "worktree-test@zcode.local",
        GIT_COMMITTER_NAME: "ZCode Worktree Test",
        GIT_COMMITTER_EMAIL: "worktree-test@zcode.local",
      },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolvePromise(stdout);
        return;
      }
      reject(new Error(`git ${args.join(" ")} failed (${code}): ${stderr || stdout}`));
    });
  });
}

async function createFixtureRepo(): Promise<{ root: string; dispose: () => Promise<void> }> {
  const root = await mkdtemp(join(tmpdir(), "zcode-worktree-"));
  await runGit(root, ["init"]);
  await runGit(root, ["checkout", "-b", "main"]);
  await writeFile(join(root, "README.md"), "hello\n");
  await runGit(root, ["add", "README.md"]);
  await runGit(root, ["commit", "-m", "initial"]);
  return {
    root,
    async dispose() {
      await rm(root, { recursive: true, force: true });
    },
  };
}

test("sanitize and validate worktree names", () => {
  assert.equal(sanitizeWorktreeName("  feature/x  "), "feature/x");
  assert.equal(isValidWorktreeName("feature-x"), true);
  assert.equal(isValidWorktreeName("feature/x"), true);
  assert.equal(isValidWorktreeName("../escape"), false);
  assert.equal(isValidWorktreeName(""), false);
  assert.equal(isValidWorktreeName("bad name"), false);
});

test("parseWorktreeListPorcelain reads locked and detached entries", () => {
  const drafts = parseWorktreeListPorcelain(
    [
      "worktree /repo",
      "HEAD abc",
      "branch refs/heads/main",
      "",
      "worktree /repo/.worktrees/task",
      "HEAD def",
      "detached",
      "locked reason text",
      "prunable",
      "",
    ].join("\n"),
  );
  assert.equal(drafts.length, 2);
  assert.equal(drafts[0]?.branchName, "main");
  assert.equal(drafts[1]?.headRefType, "detached");
  assert.equal(drafts[1]?.isLocked, true);
  assert.equal(drafts[1]?.lockReason, "reason text");
  assert.equal(drafts[1]?.isPrunable, true);
  assert.equal(pathsReferToSameDirectory("/a/b", "/a/b/"), true);
  assert.equal(resolveDefaultWorktreePath("/repo", "feat"), join("/repo", ".worktrees", "feat"));
});

test("create/list/remove worktree lifecycle and dirty guard", async () => {
  const fixture = await createFixtureRepo();
  const repo = createGitCliRepo();
  try {
    const created = await repo.createWorktree({
      workspacePath: fixture.root,
      name: "isolated-task",
    });
    assert.equal(created.ok, true, JSON.stringify(created.issues));
    assert.ok(created.path);
    assert.equal(created.branchName, "isolated-task");

    const listed = await repo.listWorktrees(fixture.root);
    assert.equal(listed.worktrees.length, 2);
    const linked = listed.worktrees.find((entry) => entry.branchName === "isolated-task");
    assert.ok(linked);
    assert.equal(linked?.isMain, false);
    assert.equal(linked?.isDirty, false);
    assert.equal(linked?.isCurrent, false);

    const readmeInWorktree = join(created.path!, "README.md");
    assert.equal(await readFile(readmeInWorktree, "utf8"), "hello\n");

    await writeFile(join(created.path!, "scratch.txt"), "dirty\n");
    const dirtyList = await repo.listWorktrees(fixture.root);
    const dirtyEntry = dirtyList.worktrees.find((entry) =>
      pathsReferToSameDirectory(entry.path, created.path!),
    );
    assert.equal(dirtyEntry?.isDirty, true);

    const blocked = await repo.removeWorktree({
      workspacePath: fixture.root,
      path: created.path!,
    });
    assert.equal(blocked.ok, false);
    assert.equal(blocked.issues[0]?.code, "dirty-worktree");

    // Confirm the tree is still registered after the blocked remove.
    const stillThere = await repo.listWorktrees(fixture.root);
    assert.ok(
      stillThere.worktrees.some((entry) => pathsReferToSameDirectory(entry.path, created.path!)),
    );

    await rm(join(created.path!, "scratch.txt"));
    const removed = await repo.removeWorktree({
      workspacePath: fixture.root,
      path: created.path!,
    });
    assert.equal(removed.ok, true, JSON.stringify(removed.issues));
    const after = await repo.listWorktrees(fixture.root);
    assert.equal(after.worktrees.length, 1);
    assert.equal(after.worktrees[0]?.isMain, true);
  } finally {
    await fixture.dispose();
  }
});

test("remove refuses main and current worktree", async () => {
  const fixture = await createFixtureRepo();
  const repo = createGitCliRepo();
  try {
    const created = await repo.createWorktree({
      workspacePath: fixture.root,
      name: "other",
    });
    assert.equal(created.ok, true);

    const mainBlocked = await repo.removeWorktree({
      workspacePath: fixture.root,
      path: fixture.root,
    });
    assert.equal(mainBlocked.ok, false);
    assert.equal(mainBlocked.issues[0]?.code, "main-worktree-protected");

    const currentBlocked = await repo.removeWorktree({
      workspacePath: created.path!,
      path: created.path!,
    });
    assert.equal(currentBlocked.ok, false);
    assert.equal(currentBlocked.issues[0]?.code, "current-worktree-protected");
  } finally {
    await fixture.dispose();
  }
});

test("force remove can delete a dirty linked worktree after explicit force", async () => {
  const fixture = await createFixtureRepo();
  const repo = createGitCliRepo();
  try {
    const created = await repo.createWorktree({
      workspacePath: fixture.root,
      name: "force-me",
    });
    assert.equal(created.ok, true);
    await mkdir(join(created.path!, "nested"), { recursive: true });
    await writeFile(join(created.path!, "nested", "x.txt"), "x\n");

    const forced = await repo.removeWorktree({
      workspacePath: fixture.root,
      path: created.path!,
      force: true,
    });
    assert.equal(forced.ok, true, JSON.stringify(forced.issues));
  } finally {
    await fixture.dispose();
  }
});
