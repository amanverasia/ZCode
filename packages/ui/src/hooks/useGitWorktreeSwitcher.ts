import { useCallback, useEffect, useRef, useState } from "react";
import type { GitWorktreeEntry, GitWorktreeListResult } from "@zcode/shared";
import { toast } from "@/components/ui/toast.js";
import {
  getPrimaryGitWorktreeIssue,
  resolveGitWorktreeIssueMessageId,
} from "@/git-worktree-switcher/display.js";
import { usePlatform } from "@/hooks/usePlatform.js";
import { useServices } from "@/hooks/useServices.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { getErrorMessage } from "@/lib/errorMessage.js";
import { logger } from "@/logger.js";
import { useTabStoreApi } from "@/store/TabStoreProvider.js";
import { useZCodeSessionStore } from "@/store/zcodeSessionStore.js";

interface UseGitWorktreeSwitcherOptions {
  workspacePath: string;
  onRefreshGit: () => void;
}

export function useGitWorktreeSwitcher({
  workspacePath,
  onRefreshGit,
}: UseGitWorktreeSwitcherOptions) {
  const { gitService } = useServices();
  const platform = usePlatform();
  const tabStoreApi = useTabStoreApi();
  const { intl } = useZCodeIntl();
  const [open, setOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [forceRemovePath, setForceRemovePath] = useState<string | null>(null);
  const [listResult, setListResult] = useState<GitWorktreeListResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [mutationPending, setMutationPending] = useState(false);

  const loadWorktrees = useCallback(async () => {
    setLoading(true);
    try {
      const next = await gitService.listWorktrees({ workspacePath });
      setListResult(next);
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      logger.warn("[GitWorktreeSwitcher] failed to list worktrees", {
        workspacePath,
        error: message,
      });
      toast(
        intl.formatMessage(
          { id: "git.worktreeSwitcher.error.requestFailed" },
          { error: message },
        ),
      );
    } finally {
      setLoading(false);
    }
  }, [gitService, intl, workspacePath]);

  useEffect(() => {
    setOpen(false);
    setCreateDialogOpen(false);
    setCreateName("");
    setForceRemovePath(null);
    setListResult(null);
  }, [workspacePath]);

  const openRef = useRef(open);
  openRef.current = open;
  useEffect(() => {
    if (openRef.current) {
      void loadWorktrees();
    }
  }, [loadWorktrees, workspacePath]);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      setOpen(nextOpen);
      if (nextOpen) {
        void loadWorktrees();
      }
    },
    [loadWorktrees],
  );

  const switchToWorktree = useCallback(
    async (entry: GitWorktreeEntry) => {
      if (entry.isCurrent) {
        setOpen(false);
        return;
      }

      setMutationPending(true);
      try {
        const activated = await platform.activateOrSetWorkspace(entry.path);
        if (activated.activated) {
          setOpen(false);
          return;
        }

        const focused = tabStoreApi.getState().activateTabByPath(entry.path);
        if (!focused) {
          tabStoreApi.getState().addTab(entry.path);
        }
        useZCodeSessionStore.getState().startDraft(entry.path);
        setOpen(false);
        toast(
          intl.formatMessage(
            { id: "git.worktreeSwitcher.toast.switchSuccess" },
            { name: entry.branchName ?? entry.path },
          ),
        );
      } catch (error: unknown) {
        const message = getErrorMessage(error);
        logger.warn("[GitWorktreeSwitcher] failed to switch worktree", {
          workspacePath,
          path: entry.path,
          error: message,
        });
        toast(
          intl.formatMessage(
            { id: "git.worktreeSwitcher.error.requestFailed" },
            { error: message },
          ),
        );
      } finally {
        setMutationPending(false);
      }
    },
    [intl, platform, tabStoreApi, workspacePath],
  );

  const createWorktree = useCallback(async () => {
    const name = createName.trim();
    if (!name) {
      return;
    }

    setMutationPending(true);
    try {
      const result = await gitService.createWorktree({
        workspacePath,
        name,
      });
      if (!result.ok) {
        const issue = getPrimaryGitWorktreeIssue(result.issues);
        toast(
          intl.formatMessage({
            id: resolveGitWorktreeIssueMessageId(issue),
          }),
        );
        return;
      }

      setListResult({
        workspacePath,
        mainTreePath: listResult?.mainTreePath ?? null,
        worktrees: result.worktrees,
      });
      setCreateDialogOpen(false);
      setCreateName("");
      onRefreshGit();
      toast(
        intl.formatMessage(
          { id: "git.worktreeSwitcher.toast.createSuccess" },
          { name: result.branchName ?? name },
        ),
      );

      const created = result.worktrees.find((entry) => entry.path === result.path);
      if (created) {
        await switchToWorktree(created);
      }
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      toast(
        intl.formatMessage(
          { id: "git.worktreeSwitcher.error.requestFailed" },
          { error: message },
        ),
      );
    } finally {
      setMutationPending(false);
    }
  }, [
    createName,
    gitService,
    intl,
    listResult?.mainTreePath,
    onRefreshGit,
    switchToWorktree,
    workspacePath,
  ]);

  const removeWorktree = useCallback(
    async (entry: GitWorktreeEntry, force = false) => {
      setMutationPending(true);
      try {
        const result = await gitService.removeWorktree({
          workspacePath,
          path: entry.path,
          force,
        });
        if (!result.ok) {
          const issue = getPrimaryGitWorktreeIssue(result.issues);
          if (issue?.code === "dirty-worktree" && !force) {
            setForceRemovePath(entry.path);
            return;
          }
          toast(
            intl.formatMessage({
              id: resolveGitWorktreeIssueMessageId(issue),
            }),
          );
          return;
        }

        setForceRemovePath(null);
        setListResult({
          workspacePath,
          mainTreePath: listResult?.mainTreePath ?? null,
          worktrees: result.worktrees,
        });
        onRefreshGit();
        toast(
          intl.formatMessage(
            { id: "git.worktreeSwitcher.toast.removeSuccess" },
            { name: entry.branchName ?? entry.path },
          ),
        );
      } catch (error: unknown) {
        const message = getErrorMessage(error);
        toast(
          intl.formatMessage(
            { id: "git.worktreeSwitcher.error.requestFailed" },
            { error: message },
          ),
        );
      } finally {
        setMutationPending(false);
      }
    },
    [gitService, intl, listResult?.mainTreePath, onRefreshGit, workspacePath],
  );

  const current = listResult?.worktrees.find((entry) => entry.isCurrent) ?? null;

  return {
    open,
    setOpen: handleOpenChange,
    createDialogOpen,
    setCreateDialogOpen,
    createName,
    setCreateName,
    forceRemovePath,
    setForceRemovePath,
    listResult,
    current,
    loading,
    mutationPending,
    switchToWorktree,
    createWorktree,
    removeWorktree,
  };
}
