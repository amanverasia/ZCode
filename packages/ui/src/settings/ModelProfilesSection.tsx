import { useCallback, useEffect, useMemo, useState } from "react";
import {
  MODEL_PROFILE_IDS,
  MODEL_PROFILE_LABELS,
  type ModelProfileId,
  type ModelProfileMapping,
  type ModelProfilesSettings,
  resolveModelProfilesSettings,
} from "@zcode/shared";
import { Input } from "@/components/ui/input.js";
import { Button } from "@/components/ui/button.js";
import { toast } from "@/components/ui/toast.js";
import { useSettings } from "@/hooks/useSettingService.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { requestApplyModelProfile } from "@/lib/modelProfileApply.js";
import { SettingsGroupCard, SettingsRow } from "@/settings/SettingsPageParts.js";
import { useShortcutCommandLabel } from "@/shortcuts/useShortcutBindings.js";

function parseFallbackModels(raw: string): ModelProfileMapping["fallbackModels"] {
  return raw
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const slash = entry.indexOf("/");
      if (slash <= 0 || slash >= entry.length - 1) return null;
      return {
        providerId: entry.slice(0, slash).trim(),
        modelId: entry.slice(slash + 1).trim(),
      };
    })
    .filter((entry): entry is { providerId: string; modelId: string } => Boolean(entry));
}

function formatFallbackModels(fallbacks: ModelProfileMapping["fallbackModels"]): string {
  return fallbacks.map((entry) => `${entry.providerId}/${entry.modelId}`).join(", ");
}

function applyCommandForProfile(profileId: ModelProfileId) {
  if (profileId === "fast") return "applyModelProfileFast" as const;
  if (profileId === "deep") return "applyModelProfileDeep" as const;
  if (profileId === "local") return "applyModelProfileLocal" as const;
  return "applyModelProfileCheap" as const;
}

function ProfileEditor({
  profileId,
  mapping,
  active,
  onSave,
  onActivate,
}: {
  profileId: ModelProfileId;
  mapping: ModelProfileMapping;
  active: boolean;
  onSave: (next: ModelProfileMapping) => Promise<void>;
  onActivate: () => Promise<void>;
}) {
  const { intl } = useZCodeIntl();
  const shortcutLabel = useShortcutCommandLabel(applyCommandForProfile(profileId));
  const [draft, setDraft] = useState(mapping);
  const [fallbackText, setFallbackText] = useState(formatFallbackModels(mapping.fallbackModels));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDraft(mapping);
    setFallbackText(formatFallbackModels(mapping.fallbackModels));
  }, [mapping]);

  const handleSave = useCallback(async () => {
    setBusy(true);
    try {
      await onSave({
        ...draft,
        fallbackModels: parseFallbackModels(fallbackText),
      });
      toast(intl.formatMessage({ id: "settings.modelProfiles.saved" }));
    } finally {
      setBusy(false);
    }
  }, [draft, fallbackText, intl, onSave]);

  return (
    <SettingsGroupCard>
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <div className="text-ui-base font-semibold text-foreground">
            {MODEL_PROFILE_LABELS[profileId]}
            {active ? (
              <span className="ml-2 rounded-md bg-surface px-2 py-0.5 text-ui-sm font-medium text-foreground-subtle">
                {intl.formatMessage({ id: "settings.modelProfiles.activeBadge" })}
              </span>
            ) : null}
          </div>
          <div className="mt-1 text-ui-base text-foreground-subtle">
            {intl.formatMessage(
              { id: "settings.modelProfiles.shortcutHint" },
              { keys: shortcutLabel || "—" },
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void handleSave()}>
            {intl.formatMessage({ id: "settings.modelProfiles.save" })}
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void onActivate()}>
            {intl.formatMessage({ id: "settings.modelProfiles.apply" })}
          </Button>
        </div>
      </div>
      <SettingsRow
        label={intl.formatMessage({ id: "settings.modelProfiles.providerId" })}
        description={intl.formatMessage({ id: "settings.modelProfiles.providerIdHint" })}
        controlLayout="wide"
        control={
          <Input
            value={draft.providerId}
            placeholder="openai-compat"
            onChange={(event) => setDraft({ ...draft, providerId: event.target.value })}
          />
        }
      />
      <SettingsRow
        label={intl.formatMessage({ id: "settings.modelProfiles.modelId" })}
        controlLayout="wide"
        control={
          <Input
            value={draft.modelId}
            placeholder="model-id"
            onChange={(event) => setDraft({ ...draft, modelId: event.target.value })}
          />
        }
      />
      <SettingsRow
        label={intl.formatMessage({ id: "settings.modelProfiles.thoughtLevel" })}
        description={intl.formatMessage({ id: "settings.modelProfiles.thoughtLevelHint" })}
        controlLayout="wide"
        control={
          <Input
            value={draft.thoughtLevel}
            placeholder="low / medium / high"
            onChange={(event) => setDraft({ ...draft, thoughtLevel: event.target.value })}
          />
        }
      />
      <SettingsRow
        label={intl.formatMessage({ id: "settings.modelProfiles.temperature" })}
        controlLayout="wide"
        control={
          <Input
            type="number"
            min={0}
            max={2}
            step={0.1}
            value={draft.temperature ?? ""}
            placeholder="—"
            onChange={(event) => {
              const raw = event.target.value.trim();
              if (!raw) {
                const { temperature: _removed, ...rest } = draft;
                setDraft(rest);
                return;
              }
              const next = Number(raw);
              if (Number.isFinite(next)) setDraft({ ...draft, temperature: next });
            }}
          />
        }
      />
      <SettingsRow
        label={intl.formatMessage({ id: "settings.modelProfiles.timeoutMs" })}
        controlLayout="wide"
        control={
          <Input
            type="number"
            min={1}
            value={draft.timeoutMs ?? ""}
            onChange={(event) => {
              const next = Number(event.target.value);
              setDraft({
                ...draft,
                timeoutMs: Number.isFinite(next) && next > 0 ? Math.trunc(next) : undefined,
              });
            }}
          />
        }
      />
      <SettingsRow
        label={intl.formatMessage({ id: "settings.modelProfiles.maxRetries" })}
        controlLayout="wide"
        control={
          <Input
            type="number"
            min={0}
            max={8}
            value={draft.maxRetries ?? ""}
            onChange={(event) => {
              const next = Number(event.target.value);
              setDraft({
                ...draft,
                maxRetries: Number.isFinite(next) && next >= 0 ? Math.trunc(next) : undefined,
              });
            }}
          />
        }
      />
      <SettingsRow
        label={intl.formatMessage({ id: "settings.modelProfiles.retryBackoffMs" })}
        controlLayout="wide"
        control={
          <Input
            type="number"
            min={1}
            value={draft.retryBackoffMs ?? ""}
            onChange={(event) => {
              const next = Number(event.target.value);
              setDraft({
                ...draft,
                retryBackoffMs: Number.isFinite(next) && next > 0 ? Math.trunc(next) : undefined,
              });
            }}
          />
        }
      />
      <SettingsRow
        label={intl.formatMessage({ id: "settings.modelProfiles.fallbackModels" })}
        description={intl.formatMessage({ id: "settings.modelProfiles.fallbackModelsHint" })}
        controlLayout="wide"
        control={
          <Input
            value={fallbackText}
            placeholder="provider/model, provider/backup"
            onChange={(event) => setFallbackText(event.target.value)}
          />
        }
      />
    </SettingsGroupCard>
  );
}

export function ModelProfilesSection() {
  const { intl } = useZCodeIntl();
  const { settings, update } = useSettings();
  const cycleShortcut = useShortcutCommandLabel("cycleModelProfile");

  const profiles = useMemo(
    () => resolveModelProfilesSettings(settings?.modelProfiles),
    [settings?.modelProfiles],
  );
  const activeId = settings?.activeModelProfileId ?? null;

  const handleSave = useCallback(
    async (profileId: ModelProfileId, next: ModelProfileMapping) => {
      const patch: ModelProfilesSettings = { ...profiles, [profileId]: next };
      await update({ modelProfiles: patch });
    },
    [profiles, update],
  );

  const handleActivate = useCallback(
    async (profileId: ModelProfileId) => {
      const mapping = profiles[profileId];
      if (!mapping.providerId.trim() || !mapping.modelId.trim()) {
        toast(intl.formatMessage({ id: "settings.modelProfiles.incomplete" }));
        return;
      }
      // Persist active id first, then ask the live composer (if any) to apply.
      await update({ activeModelProfileId: profileId });
      requestApplyModelProfile(profileId);
    },
    [intl, profiles, update],
  );

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="text-ui-base text-foreground-subtle">
          {intl.formatMessage({ id: "settings.modelProfiles.description" })}
        </p>
        <p className="text-ui-base text-foreground-subtle">
          {intl.formatMessage(
            { id: "settings.modelProfiles.cycleHint" },
            { keys: cycleShortcut || "—" },
          )}
        </p>
      </div>
      {MODEL_PROFILE_IDS.map((profileId) => (
        <ProfileEditor
          key={profileId}
          profileId={profileId}
          mapping={profiles[profileId]}
          active={activeId === profileId}
          onSave={(next) => handleSave(profileId, next)}
          onActivate={() => handleActivate(profileId)}
        />
      ))}
    </div>
  );
}
