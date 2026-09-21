import { useMemo, type KeyboardEvent } from "react";
import type { GitRepositorySummary } from "@zcode/shared";
import { Button } from "@/components/ui/button.js";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command.js";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover.js";
import { cn } from "@/components/lib/utils.js";
import {
  GitWorktreeCreateDialog,
  GitWorktreeForceRemoveDialog,
} from "@/git-worktree-switcher/GitWorktreeDialogs.js";
import {
  matchesGitWorktreeSearch,
  resolveGitWorktreeTriggerLabel,
} from "@/git-worktree-switcher/display.js";
import { useGitWorktreeSwitcher } from "@/hooks/useGitWorktreeSwitcher.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import {
  isCoarseTouchDevice,
  shouldRestoreChatInputFocusAfterPickerClose,
} from "@/lib/pickerFocus.js";
import { CheckIcon, FolderGit2Icon, LoaderIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";

interface GitWorktreeSwitcherProps {
  workspacePath: string;
  gitSummary: GitRepositorySummary;
  onRefreshGit: () => void;
  className?: string;
  triggerClassName?: string;
  popoverClassName?: string;
  listClassName?: string;
  popoverSide?: "top" | "bottom" | "left" | "right";
  avoidPopoverCollisions?: boolean;
}

export function GitWorktreeSwitcher({
  workspacePath,
  gitSummary,
  onRefreshGit,
  className,
  triggerClassName,
  popoverClassName,
  listClassName,
  popoverSide = "top",
  avoidPopoverCollisions = true,
}: GitWorktreeSwitcherProps) {
  const { intl } = useZCodeIntl();
  const [search, setSearch] = useState("");
  const {
    open,
    setOpen,
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
  } = useGitWorktreeSwitcher({
    workspacePath,
    onRefreshGit,
  });

  const isVisible = gitSummary.isGitAvailable && gitSummary.isRepository;
  const triggerLabel = useMemo(
    () =>
      resolveGitWorktreeTriggerLabel({
        current,
        fallbackLabel: intl.formatMessage({ id: "git.worktreeSwitcher.label" }),
        mainLabel: intl.formatMessage({ id: "git.worktreeSwitcher.main" }),
      }),
    [current, intl],
  );

  const worktrees = useMemo(() => {
    const entries = listResult?.worktrees ?? [];
    return entries.filter((entry) => matchesGitWorktreeSearch(entry, search));
  }, [listResult?.worktrees, search]);

  if (!isVisible) {
    return null;
  }

  return (
    <div className={cn("px-3 pt-1", className)}>
      <Popover
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen) {
            setSearch("");
            if (
              shouldRestoreChatInputFocusAfterPickerClose({
                isCoarseTouchDevice: isCoarseTouchDevice(),
              })
            ) {
              // Branch/worktree pickers sit near the composer; restore focus after close.
              requestAnimationFrame(() => {
                const input = document.querySelector<HTMLElement>(
                  "[data-testid='chat-input'], textarea[data-chat-input='true']",
                );
                input?.focus();
              });
            }
          }
        }}
      >
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={intl.formatMessage({ id: "git.worktreeSwitcher.trigger.ariaLabel" })}
            className={cn(
              "h-7 w-full justify-start gap-1.5 px-2 text-foreground-subtle hover:bg-hover hover:text-foreground",
              triggerClassName,
            )}
          >
            <FolderGit2Icon className="size-3.5 shrink-0" />
            <span className="min-w-0 flex-1 truncate text-left">{triggerLabel}</span>
            {loading || mutationPending ? (
              <LoaderIcon className="size-3.5 shrink-0 animate-spin" />
            ) : null}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          side={popoverSide}
          avoidCollisions={avoidPopoverCollisions}
          className={cn("w-80 p-0", popoverClassName)}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
          }}
        >
          <Command shouldFilter={false}>
            <CommandInput
              value={search}
              onValueChange={setSearch}
              placeholder={intl.formatMessage({
                id: "git.worktreeSwitcher.searchPlaceholder",
              })}
            />
            <CommandList className={cn("max-h-64", listClassName)}>
              <CommandEmpty>
                {intl.formatMessage({ id: "git.worktreeSwitcher.empty" })}
              </CommandEmpty>
              <CommandGroup>
                {worktrees.map((entry) => (
                  <CommandItem
                    key={entry.path}
                    value={entry.path}
                    disabled={mutationPending}
                    onSelect={() => {
                      void switchToWorktree(entry);
                    }}
                    onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
                      if (event.key === "Delete" && !entry.isMain && !entry.isCurrent) {
                        event.preventDefault();
                        void removeWorktree(entry);
                      }
                    }}
                    className="group items-start gap-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        {entry.isCurrent ? (
                          <CheckIcon className="size-3.5 shrink-0 text-foreground" />
                        ) : (
                          <span className="size-3.5 shrink-0" />
                        )}
                        <span className="truncate font-medium">
                          {entry.branchName ??
                            intl.formatMessage({ id: "git.head.detached" })}
                        </span>
                        {entry.isMain ? (
                          <span className="shrink-0 text-ui-sm text-foreground-subtle">
                            {intl.formatMessage({ id: "git.worktreeSwitcher.mainBadge" })}
                          </span>
                        ) : null}
                        {entry.isDirty ? (
                          <span className="shrink-0 text-ui-sm text-foreground-subtle">
                            {intl.formatMessage({ id: "git.worktreeSwitcher.dirtyBadge" })}
                          </span>
                        ) : null}
                      </div>
                      <div className="truncate pl-5 font-mono text-ui-sm text-foreground-subtle">
                        {entry.path}
                      </div>
                    </div>
                    {!entry.isMain && !entry.isCurrent ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="opacity-0 group-hover:opacity-100"
                        aria-label={intl.formatMessage({
                          id: "git.worktreeSwitcher.remove.ariaLabel",
                        })}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          void removeWorktree(entry);
                        }}
                      >
                        <Trash2Icon className="size-3.5" />
                      </Button>
                    ) : null}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
            <div className="border-t border-popover-border p-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-full justify-start gap-2"
                disabled={mutationPending}
                onClick={() => {
                  setOpen(false);
                  setCreateDialogOpen(true);
                }}
              >
                <PlusIcon className="size-3.5" />
                {intl.formatMessage({ id: "git.worktreeSwitcher.createAction" })}
              </Button>
            </div>
          </Command>
        </PopoverContent>
      </Popover>

      <GitWorktreeCreateDialog
        open={createDialogOpen}
        name={createName}
        mutationPending={mutationPending}
        onOpenChange={setCreateDialogOpen}
        onNameChange={setCreateName}
        onCancel={() => {
          setCreateDialogOpen(false);
        }}
        onSubmit={() => {
          void createWorktree();
        }}
      />

      <GitWorktreeForceRemoveDialog
        open={forceRemovePath !== null}
        mutationPending={mutationPending}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setForceRemovePath(null);
          }
        }}
        onCancel={() => {
          setForceRemovePath(null);
        }}
        onConfirm={() => {
          const entry = listResult?.worktrees.find((item) => item.path === forceRemovePath);
          if (entry) {
            void removeWorktree(entry, true);
          }
        }}
      />
    </div>
  );
}
