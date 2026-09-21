import type { ModelProfileId } from "@zcode/shared";

export const MODEL_PROFILE_APPLY_EVENT = "zcode:apply-model-profile";

export interface ModelProfileApplyEventDetail {
  profileId: ModelProfileId;
}

/** Ask the active composer to apply a model profile (settings / command center / shortcuts). */
export function requestApplyModelProfile(profileId: ModelProfileId): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<ModelProfileApplyEventDetail>(MODEL_PROFILE_APPLY_EVENT, {
      detail: { profileId },
    }),
  );
}
