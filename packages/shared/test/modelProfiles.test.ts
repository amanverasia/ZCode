import assert from "node:assert/strict";
import test from "node:test";
import {
  createEmptyModelProfileMapping,
  getNextModelProfileId,
  MODEL_PROFILE_IDS,
  resolveModelProfile,
  resolveModelProfilesSettings,
} from "../src/modelProfiles.js";
import { appSettingsPatchSchema, appSettingsSchema } from "../src/validationAppSettings.js";
import {
  getDefaultShortcutBindings,
  isValidShortcutBinding,
  SHORTCUT_COMMANDS,
} from "../src/shortcutCommands.js";

test("resolveModelProfilesSettings fills all four profiles with policy defaults", () => {
  const resolved = resolveModelProfilesSettings(undefined);
  assert.deepEqual([...MODEL_PROFILE_IDS], ["fast", "deep", "local", "cheap"]);
  for (const id of MODEL_PROFILE_IDS) {
    assert.equal(resolved[id].providerId, "");
    assert.equal(resolved[id].modelId, "");
    assert.ok((resolved[id].timeoutMs ?? 0) > 0);
    assert.ok((resolved[id].maxRetries ?? -1) >= 0);
  }
  assert.equal(resolved.fast.timeoutMs, 60_000);
  assert.equal(resolved.deep.timeoutMs, 180_000);
  assert.equal(resolved.local.maxRetries, 1);
});

test("resolveModelProfilesSettings merges user overrides without inventing vendors", () => {
  const resolved = resolveModelProfilesSettings({
    fast: {
      providerId: "openai-compat",
      modelId: "gpt-fast",
      thoughtLevel: "low",
      temperature: 0.2,
      fallbackModels: [{ providerId: "openai-compat", modelId: "gpt-backup" }],
      timeoutMs: 45_000,
      maxRetries: 1,
      retryBackoffMs: 500,
    },
  });
  assert.equal(resolved.fast.providerId, "openai-compat");
  assert.equal(resolved.fast.modelId, "gpt-fast");
  assert.equal(resolved.fast.thoughtLevel, "low");
  assert.equal(resolved.fast.temperature, 0.2);
  assert.equal(resolved.fast.fallbackModels.length, 1);
  assert.equal(resolved.deep.providerId, "");
});

test("resolveModelProfile requires provider and model", () => {
  const missing = resolveModelProfile("local", {});
  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.equal(missing.reason, "provider-or-model-missing");
  }

  const ready = resolveModelProfile("local", {
    local: {
      ...createEmptyModelProfileMapping("local"),
      providerId: "ollama",
      modelId: "qwen2.5-coder",
      thoughtLevel: "medium",
    },
  });
  assert.equal(ready.ok, true);
  if (ready.ok) {
    assert.equal(ready.modelSelection.providerId, "ollama");
    assert.equal(ready.modelSelection.modelId, "qwen2.5-coder");
    assert.equal(ready.modelSelection.options?.reasoningLevel, "medium");
  }
});

test("getNextModelProfileId cycles FAST → DEEP → LOCAL → CHEAP", () => {
  assert.equal(getNextModelProfileId(undefined), "fast");
  assert.equal(getNextModelProfileId("fast"), "deep");
  assert.equal(getNextModelProfileId("deep"), "local");
  assert.equal(getNextModelProfileId("local"), "cheap");
  assert.equal(getNextModelProfileId("cheap"), "fast");
});

test("app settings accept modelProfiles patch and strip nothing else", () => {
  const parsed = appSettingsSchema.parse({
    modelProfiles: {
      cheap: {
        providerId: "openrouter",
        modelId: "cheap-model",
        thoughtLevel: "",
        fallbackModels: [],
        timeoutMs: 90_000,
        maxRetries: 2,
        retryBackoffMs: 1_000,
      },
    },
    activeModelProfileId: "cheap",
  });
  assert.equal(parsed.activeModelProfileId, "cheap");
  assert.equal(parsed.modelProfiles?.cheap?.providerId, "openrouter");

  const patch = appSettingsPatchSchema.parse({
    activeModelProfileId: "fast",
    modelProfiles: {
      fast: {
        providerId: "zai",
        modelId: "glm-fast",
        thoughtLevel: "low",
        fallbackModels: [],
      },
    },
  });
  assert.equal(patch.activeModelProfileId, "fast");
});

test("model profile shortcut defaults are valid and do not collide with each other", () => {
  const profileCommands = [
    "applyModelProfileFast",
    "applyModelProfileDeep",
    "applyModelProfileLocal",
    "applyModelProfileCheap",
    "cycleModelProfile",
  ] as const;
  const seen = new Set<string>();
  for (const id of profileCommands) {
    const entry = SHORTCUT_COMMANDS.find((candidate) => candidate.id === id);
    assert.ok(entry, id);
    const bindings = getDefaultShortcutBindings(id);
    assert.ok(bindings.length > 0, id);
    for (const binding of bindings) {
      assert.equal(isValidShortcutBinding(binding), true, binding);
      assert.equal(seen.has(binding), false, `duplicate ${binding}`);
      seen.add(binding);
    }
  }
  // Explicitly avoid digit chords (Ctrl+Alt+1 illustrative only) and side-pane Ctrl+Alt+b.
  assert.equal(seen.has("Ctrl+Alt+b"), false);
  assert.equal(seen.has("Ctrl+Alt+1"), false);
  assert.ok(seen.has("Ctrl+Alt+f"));
  assert.ok(seen.has("Ctrl+Alt+p"));
});
