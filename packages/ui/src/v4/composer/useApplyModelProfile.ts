import { useCallback, useEffect } from "react";
import {
  getNextModelProfileId,
  MODEL_PROFILE_LABELS,
  resolveModelProfile,
  type ModelProfileId,
} from "@zcode/shared";
import { toast } from "@/components/ui/toast.js";
import { useSettings } from "@/hooks/useSettingService.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import {
  MODEL_PROFILE_APPLY_EVENT,
  type ModelProfileApplyEventDetail,
} from "@/lib/modelProfileApply.js";

type SelectModelHandler = (
  providerId: string,
  modelId: string,
  sourceModel: null,
) => void;

type SelectThoughtHandler = (
  thought: string,
  modelContext: { provider: string; model: string },
) => void;

export function useApplyModelProfile(params: {
  disabled: boolean;
  onSelectModel: SelectModelHandler;
  onSelectThought: SelectThoughtHandler;
}) {
  const { disabled, onSelectModel, onSelectThought } = params;
  const { settings, update } = useSettings();
  const { intl } = useZCodeIntl();

  const applyProfile = useCallback(
    async (profileId: ModelProfileId) => {
      if (disabled) return;
      const resolved = resolveModelProfile(profileId, settings?.modelProfiles);
      if (!resolved.ok) {
        toast(intl.formatMessage({ id: "settings.modelProfiles.incomplete" }));
        return;
      }
      const { modelSelection, mapping } = resolved;
      onSelectModel(modelSelection.providerId, modelSelection.modelId, null);
      const thought =
        modelSelection.options?.reasoningLevel?.trim() || mapping.thoughtLevel.trim();
      if (thought) {
        onSelectThought(thought, {
          provider: modelSelection.providerId,
          model: modelSelection.modelId,
        });
      }
      await update({ activeModelProfileId: profileId });
      toast(
        intl.formatMessage(
          { id: "settings.modelProfiles.applied" },
          {
            profile: MODEL_PROFILE_LABELS[profileId],
            model: `${modelSelection.providerId}/${modelSelection.modelId}`,
          },
        ),
      );
    },
    [disabled, intl, onSelectModel, onSelectThought, settings?.modelProfiles, update],
  );

  const cycleProfile = useCallback(() => {
    const next = getNextModelProfileId(settings?.activeModelProfileId ?? undefined);
    void applyProfile(next);
  }, [applyProfile, settings?.activeModelProfileId]);

  useEffect(() => {
    function onRequest(event: Event) {
      const detail = (event as CustomEvent<ModelProfileApplyEventDetail>).detail;
      if (!detail?.profileId) return;
      void applyProfile(detail.profileId);
    }
    window.addEventListener(MODEL_PROFILE_APPLY_EVENT, onRequest);
    return () => window.removeEventListener(MODEL_PROFILE_APPLY_EVENT, onRequest);
  }, [applyProfile]);

  return { applyProfile, cycleProfile };
}
