/**
 * Model profile keyboard apply (composer-scoped, same channel as openModelMenu).
 */
import { useEffect, useRef } from "react";
import {
  MODEL_PROFILE_APPLY_COMMAND_IDS,
  MODEL_PROFILE_COMMAND_TO_ID,
  type ModelProfileId,
  type ShortcutCommandId,
} from "@zcode/shared";
import {
  isShortcutRecordingActive,
  matchesShortcutBinding,
  type EffectiveShortcutBindings,
} from "@/shortcuts/bindings.js";
import { useEffectiveShortcutBindings } from "@/shortcuts/useShortcutBindings.js";

interface ProfileShortcutKeyboardEvent {
  key: string;
  code?: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  defaultPrevented: boolean;
  repeat: boolean;
  isComposing: boolean;
}

function resolveProfileShortcutAction(
  event: ProfileShortcutKeyboardEvent,
  effective: EffectiveShortcutBindings,
): ModelProfileId | "cycle" | null {
  if (event.defaultPrevented || event.repeat || event.isComposing) {
    return null;
  }
  for (const commandId of MODEL_PROFILE_APPLY_COMMAND_IDS) {
    for (const binding of effective[commandId] ?? []) {
      if (matchesShortcutBinding(event, binding)) {
        return MODEL_PROFILE_COMMAND_TO_ID[commandId];
      }
    }
  }
  for (const binding of effective.cycleModelProfile ?? []) {
    if (matchesShortcutBinding(event, binding)) {
      return "cycle";
    }
  }
  return null;
}

export function useModelProfileShortcutBindings(params: {
  disabled: boolean;
  onApplyProfile: (profileId: ModelProfileId) => void;
  onCycleProfile: () => void;
}) {
  const { disabled, onApplyProfile, onCycleProfile } = params;
  const effectiveBindings = useEffectiveShortcutBindings();
  const effectiveRef = useRef(effectiveBindings);
  effectiveRef.current = effectiveBindings;
  const applyRef = useRef(onApplyProfile);
  applyRef.current = onApplyProfile;
  const cycleRef = useRef(onCycleProfile);
  cycleRef.current = onCycleProfile;

  useEffect(() => {
    if (disabled) return;

    function handleWindowKeydown(event: KeyboardEvent) {
      if (isShortcutRecordingActive()) return;
      const action = resolveProfileShortcutAction(event, effectiveRef.current);
      if (!action) return;
      event.preventDefault();
      if (action === "cycle") {
        cycleRef.current();
        return;
      }
      applyRef.current(action);
    }

    window.addEventListener("keydown", handleWindowKeydown, true);
    return () => window.removeEventListener("keydown", handleWindowKeydown, true);
  }, [disabled]);
}

/** Exported for unit tests. */
export function resolveModelProfileShortcutForTest(
  event: ProfileShortcutKeyboardEvent,
  effective: Partial<Record<ShortcutCommandId, readonly string[]>>,
): ModelProfileId | "cycle" | null {
  return resolveProfileShortcutAction(event, effective as EffectiveShortcutBindings);
}
