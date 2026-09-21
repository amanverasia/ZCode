import { type FormEvent } from "react";
import { Button } from "@/components/ui/button.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.js";
import { Input } from "@/components/ui/input.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { LoaderIcon } from "lucide-react";

interface GitWorktreeCreateDialogProps {
  open: boolean;
  name: string;
  mutationPending: boolean;
  onOpenChange: (nextOpen: boolean) => void;
  onNameChange: (nextValue: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}

export function GitWorktreeCreateDialog({
  open,
  name,
  mutationPending,
  onOpenChange,
  onNameChange,
  onCancel,
  onSubmit,
}: GitWorktreeCreateDialogProps) {
  const { intl } = useZCodeIntl();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg gap-0 overflow-hidden rounded-2xl p-0">
        <DialogHeader className="gap-2 px-6 py-5 pb-0">
          <DialogTitle className="text-lg font-medium text-foreground">
            {intl.formatMessage({ id: "git.worktreeSwitcher.createDialog.title" })}
          </DialogTitle>
          <DialogDescription className="text-ui-base leading-6 text-foreground-subtle">
            {intl.formatMessage({ id: "git.worktreeSwitcher.createDialog.description" })}
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-5 px-6 py-6"
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <div className="space-y-2">
            <label
              htmlFor="git-worktree-switcher-create-input"
              className="inline-flex text-ui-base font-medium text-foreground-subtle"
            >
              {intl.formatMessage({ id: "git.worktreeSwitcher.createDialog.nameLabel" })}
            </label>
            <Input
              id="git-worktree-switcher-create-input"
              size="lg"
              autoFocus
              value={name}
              disabled={mutationPending}
              placeholder={intl.formatMessage({
                id: "git.worktreeSwitcher.createDialog.namePlaceholder",
              })}
              onChange={(event) => {
                onNameChange(event.target.value);
              }}
            />
            <p className="text-ui-sm text-foreground-subtle">
              {intl.formatMessage({ id: "git.worktreeSwitcher.createDialog.helper" })}
            </p>
          </div>

          <DialogFooter className="gap-2 sm:justify-end">
            <Button type="button" variant="ghost" disabled={mutationPending} onClick={onCancel}>
              {intl.formatMessage({ id: "common.cancel" })}
            </Button>
            <Button type="submit" disabled={mutationPending || name.trim().length === 0}>
              {mutationPending ? <LoaderIcon className="size-4 animate-spin" /> : null}
              {intl.formatMessage({ id: "git.worktreeSwitcher.createDialog.confirm" })}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface GitWorktreeForceRemoveDialogProps {
  open: boolean;
  mutationPending: boolean;
  onOpenChange: (nextOpen: boolean) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

export function GitWorktreeForceRemoveDialog({
  open,
  mutationPending,
  onOpenChange,
  onCancel,
  onConfirm,
}: GitWorktreeForceRemoveDialogProps) {
  const { intl } = useZCodeIntl();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg gap-0 overflow-hidden rounded-2xl p-0">
        <DialogHeader className="gap-2 px-6 py-5 pb-0">
          <DialogTitle className="text-lg font-medium text-foreground">
            {intl.formatMessage({ id: "git.worktreeSwitcher.forceRemove.title" })}
          </DialogTitle>
          <DialogDescription className="text-ui-base leading-6 text-foreground-subtle">
            {intl.formatMessage({ id: "git.worktreeSwitcher.forceRemove.description" })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 px-6 py-5 sm:justify-end">
          <Button type="button" variant="ghost" disabled={mutationPending} onClick={onCancel}>
            {intl.formatMessage({ id: "common.cancel" })}
          </Button>
          <Button type="button" variant="destructive" disabled={mutationPending} onClick={onConfirm}>
            {mutationPending ? <LoaderIcon className="size-4 animate-spin" /> : null}
            {intl.formatMessage({ id: "git.worktreeSwitcher.forceRemove.confirm" })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
