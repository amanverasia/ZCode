import { z } from "zod";
import { modelSelectionSchema, type ModelSelection } from "./model-selection.js";

/** Named, vendor-agnostic model profiles. IDs are stable settings keys. */
export const MODEL_PROFILE_IDS = ["fast", "deep", "local", "cheap"] as const;
export type ModelProfileId = (typeof MODEL_PROFILE_IDS)[number];

export const modelProfileIdSchema = z.enum(MODEL_PROFILE_IDS);

/** One fallback target in a profile chain (provider + model, no secrets). */
export const modelProfileFallbackSchema = z
  .object({
    providerId: z.string().trim().min(1),
    modelId: z.string().trim().min(1),
  })
  .strict();

export type ModelProfileFallback = z.infer<typeof modelProfileFallbackSchema>;

/**
 * User-editable mapping for a profile.
 * Provider/model stay empty until configured — never hardcode vendors.
 * Timeout / retry / fallback are persisted for apply + future provider policy.
 */
export const modelProfileMappingSchema = z
  .object({
    providerId: z.string().trim().default(""),
    modelId: z.string().trim().default(""),
    /** Thought / reasoning level string from the model catalog (may be empty). */
    thoughtLevel: z.string().trim().default(""),
    /** Optional sampling temperature; stored for future request params. */
    temperature: z.number().min(0).max(2).optional(),
    /** Opaque extra request params (numbers/strings/bools only). */
    params: z
      .record(z.string().trim().min(1), z.union([z.string(), z.number(), z.boolean()]))
      .optional(),
    fallbackModels: z.array(modelProfileFallbackSchema).default([]),
    /** Request timeout budget in ms; soft policy, not a hard transport kill yet. */
    timeoutMs: z.number().int().positive().max(30 * 60 * 1000).optional(),
    /** Bounded retry count for retryable provider failures. */
    maxRetries: z.number().int().min(0).max(8).optional(),
    /** Initial backoff between retries in ms. */
    retryBackoffMs: z.number().int().positive().max(60_000).optional(),
  })
  .strict();

export type ModelProfileMapping = z.infer<typeof modelProfileMappingSchema>;

export const modelProfilesSettingsSchema = z
  .partialRecord(modelProfileIdSchema, modelProfileMappingSchema)
  .default({});

export type ModelProfilesSettings = z.infer<typeof modelProfilesSettingsSchema>;

const EMPTY_MAPPING: ModelProfileMapping = {
  providerId: "",
  modelId: "",
  thoughtLevel: "",
  fallbackModels: [],
};

/** Soft defaults for timeout/retry by profile intent (still vendor-agnostic). */
export const DEFAULT_MODEL_PROFILE_POLICIES: Readonly<
  Record<ModelProfileId, Pick<ModelProfileMapping, "timeoutMs" | "maxRetries" | "retryBackoffMs">>
> = {
  fast: { timeoutMs: 60_000, maxRetries: 2, retryBackoffMs: 750 },
  deep: { timeoutMs: 180_000, maxRetries: 3, retryBackoffMs: 1_500 },
  local: { timeoutMs: 300_000, maxRetries: 1, retryBackoffMs: 1_000 },
  cheap: { timeoutMs: 90_000, maxRetries: 2, retryBackoffMs: 1_000 },
};

export function createEmptyModelProfileMapping(
  id: ModelProfileId,
): ModelProfileMapping {
  return {
    ...EMPTY_MAPPING,
    ...DEFAULT_MODEL_PROFILE_POLICIES[id],
  };
}

/** Merge user overrides onto empty defaults for all four profiles. */
export function resolveModelProfilesSettings(
  raw: ModelProfilesSettings | null | undefined,
): Record<ModelProfileId, ModelProfileMapping> {
  const result = {} as Record<ModelProfileId, ModelProfileMapping>;
  for (const id of MODEL_PROFILE_IDS) {
    const parsed = modelProfileMappingSchema.safeParse(raw?.[id] ?? {});
    result[id] = parsed.success
      ? { ...createEmptyModelProfileMapping(id), ...parsed.data }
      : createEmptyModelProfileMapping(id);
  }
  return result;
}

export type ResolvedModelProfile =
  | {
      ok: true;
      profileId: ModelProfileId;
      mapping: ModelProfileMapping;
      modelSelection: ModelSelection;
    }
  | {
      ok: false;
      profileId: ModelProfileId;
      mapping: ModelProfileMapping;
      reason: "provider-or-model-missing";
    };

/** Resolve a profile into a ModelSelection the composer can apply. */
export function resolveModelProfile(
  profileId: ModelProfileId,
  raw: ModelProfilesSettings | null | undefined,
): ResolvedModelProfile {
  const mapping = resolveModelProfilesSettings(raw)[profileId];
  const providerId = mapping.providerId.trim();
  const modelId = mapping.modelId.trim();
  if (!providerId || !modelId) {
    return { ok: false, profileId, mapping, reason: "provider-or-model-missing" };
  }
  const thoughtLevel = mapping.thoughtLevel.trim();
  const modelSelection = modelSelectionSchema.parse({
    providerId,
    modelId,
    ...(thoughtLevel ? { options: { reasoningLevel: thoughtLevel } } : {}),
  });
  return { ok: true, profileId, mapping, modelSelection };
}

export function getNextModelProfileId(
  current: ModelProfileId | null | undefined,
): ModelProfileId {
  if (!current) return MODEL_PROFILE_IDS[0];
  const index = MODEL_PROFILE_IDS.indexOf(current);
  if (index < 0) return MODEL_PROFILE_IDS[0];
  return MODEL_PROFILE_IDS[(index + 1) % MODEL_PROFILE_IDS.length]!;
}

export function isModelProfileId(value: string): value is ModelProfileId {
  return (MODEL_PROFILE_IDS as readonly string[]).includes(value);
}

export const MODEL_PROFILE_LABELS: Readonly<Record<ModelProfileId, string>> = {
  fast: "FAST",
  deep: "DEEP",
  local: "LOCAL",
  cheap: "CHEAP",
};

/** Shortcut command IDs that apply a concrete profile (excludes cycle). */
export const MODEL_PROFILE_APPLY_COMMAND_IDS = [
  "applyModelProfileFast",
  "applyModelProfileDeep",
  "applyModelProfileLocal",
  "applyModelProfileCheap",
] as const;

export type ModelProfileApplyCommandId = (typeof MODEL_PROFILE_APPLY_COMMAND_IDS)[number];

export const MODEL_PROFILE_COMMAND_TO_ID: Readonly<
  Record<ModelProfileApplyCommandId, ModelProfileId>
> = {
  applyModelProfileFast: "fast",
  applyModelProfileDeep: "deep",
  applyModelProfileLocal: "local",
  applyModelProfileCheap: "cheap",
};
