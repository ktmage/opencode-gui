/**
 * model-effort.ts のユニットテスト。
 *
 * 検証対象:
 *   1. supported metadata -> provider/server 順の normalized ids
 *   2. disabled variants はフィルタされる
 *   3. label / name / title メタデータが label に反映される
 *   4. unsupported metadata / reasoning-only model -> []
 *   5. unset default effort -> undefined / no override
 *   6. model-change invalidation: 同 id は維持、未対応 id はクリア
 */
import { describe, expect, it } from "vitest";
import type { ModelInfo, ModelVariantRef } from "../domain";
import { getModelVariants, isModelVariantSupported, validateModelVariant } from "../model-effort";

// ============================================================
// Test fixtures
// ============================================================

function makeModel(overrides: Partial<ModelInfo>): ModelInfo {
  return {
    id: "test-model",
    name: "Test Model",
    limit: { context: 0, output: 0 },
    ...overrides,
  };
}

// OpenAI gpt-5.4-style metadata, real shape from the SDK probe.
const gpt54: ModelInfo = makeModel({
  id: "openai/gpt-5.4",
  name: "GPT-5.4",
  reasoning: true,
  variants: {
    none: { reasoningEffort: "none", reasoningSummary: "auto" },
    low: { reasoningEffort: "low", reasoningSummary: "auto" },
    medium: { reasoningEffort: "medium", reasoningSummary: "auto" },
    high: { reasoningEffort: "high", reasoningSummary: "auto" },
    xhigh: { reasoningEffort: "xhigh", reasoningSummary: "auto" },
  },
});

// DeepSeek deepseek-reasoner has reasoning: true but no variants.
const deepseekReasoner: ModelInfo = makeModel({
  id: "deepseek/deepseek-reasoner",
  name: "DeepSeek Reasoner",
  reasoning: true,
});

// DeepSeek deepseek-v4-pro uses [low, medium, high, max].
const deepseekV4Pro: ModelInfo = makeModel({
  id: "deepseek/deepseek-v4-pro",
  name: "DeepSeek v4 Pro",
  reasoning: true,
  variants: {
    low: { label: "Low" },
    medium: { name: "Medium" },
    high: { title: "High" },
    max: {},
  },
});

// ============================================================
// getModelVariants
// ============================================================

describe("getModelVariants", () => {
  it("returns normalized ids in server-supplied order", () => {
    const result = getModelVariants(gpt54);
    expect(result.map((v) => v.id)).toEqual(["none", "low", "medium", "high", "xhigh"]);
  });

  it("returns empty array for a reasoning-only model with no variants", () => {
    expect(getModelVariants(deepseekReasoner)).toEqual([]);
  });

  it("returns empty array for a model with an empty variants map", () => {
    const model = makeModel({ variants: {} });
    expect(getModelVariants(model)).toEqual([]);
  });

  it("returns empty array for null / undefined model", () => {
    expect(getModelVariants(null)).toEqual([]);
    expect(getModelVariants(undefined)).toEqual([]);
  });

  it("returns empty array when model has no variants field", () => {
    const model = makeModel({});
    expect(getModelVariants(model)).toEqual([]);
  });

  it("returns empty array for defensive non-object variants values", () => {
    // `as unknown as` covers invalid runtime shapes that could arrive from
    // older SDKs or upstream bugs; the helper must not throw.
    const modelNull = makeModel({ variants: null as unknown as never });
    const modelStr = makeModel({ variants: "oops" as unknown as never });
    const modelArr = makeModel({ variants: [] as unknown as never });
    expect(getModelVariants(modelNull)).toEqual([]);
    expect(getModelVariants(modelStr)).toEqual([]);
    expect(getModelVariants(modelArr)).toEqual([]);
  });

  it("filters out disabled variants", () => {
    const model = makeModel({
      variants: {
        low: { label: "Low" },
        medium: { label: "Medium", disabled: true },
        high: { label: "High", disabled: false },
      },
    });
    const result = getModelVariants(model);
    expect(result.map((v) => v.id)).toEqual(["low", "high"]);
  });

  it("filters out non-object variant values defensively", () => {
    const model = makeModel({
      variants: {
        low: { label: "Low" },
        broken: "not-an-object" as unknown as never,
        high: { label: "High" },
      },
    });
    const result = getModelVariants(model);
    expect(result.map((v) => v.id)).toEqual(["low", "high"]);
  });

  it("reflects label / name / title metadata as the display label", () => {
    const result = getModelVariants(deepseekV4Pro);
    expect(result).toEqual([
      { id: "low", label: "Low" },
      { id: "medium", label: "Medium" },
      { id: "high", label: "High" },
      { id: "max" },
    ]);
  });

  it("keeps an id-only ref when no label / name / title is present", () => {
    const model = makeModel({
      variants: { max: { reasoningEffort: "max" } },
    });
    const result = getModelVariants(model);
    expect(result).toEqual([{ id: "max" }]);
    expect(result[0]).not.toHaveProperty("label");
  });

  it("ignores non-string label / name / title values", () => {
    const model = makeModel({
      variants: {
        bad: { label: 123, name: null, title: { nested: "x" } },
        ok: { label: "OK" },
      },
    });
    const result = getModelVariants(model);
    expect(result).toEqual([{ id: "bad" }, { id: "ok", label: "OK" }]);
  });

  it("ignores empty-string label / name / title", () => {
    const model = makeModel({
      variants: { ok: { label: "" } },
    });
    const result = getModelVariants(model);
    expect(result).toEqual([{ id: "ok" }]);
  });

  it("prefers label, then name, then title when multiple are present", () => {
    const model = makeModel({
      variants: {
        a: { label: "L", name: "N", title: "T" },
        b: { name: "N", title: "T" },
        c: { title: "T" },
      },
    });
    const result = getModelVariants(model);
    expect(result[0]).toEqual({ id: "a", label: "L" });
    expect(result[1]).toEqual({ id: "b", label: "N" });
    expect(result[2]).toEqual({ id: "c", label: "T" });
  });
});

// ============================================================
// isModelVariantSupported
// ============================================================

describe("isModelVariantSupported", () => {
  it("returns true for unset effort (default / no override is always allowed)", () => {
    expect(isModelVariantSupported(gpt54, undefined)).toBe(true);
    expect(isModelVariantSupported(gpt54, null)).toBe(true);
  });

  it("returns true when the model advertises the effort id", () => {
    expect(isModelVariantSupported(gpt54, { id: "medium" })).toBe(true);
  });

  it("returns false when the model does not advertise the effort id", () => {
    expect(isModelVariantSupported(deepseekReasoner, { id: "low" })).toBe(false);
  });

  it("returns false when the model has a different variant set", () => {
    // gpt-5.4 does not advertise "max" (DeepSeek-only).
    expect(isModelVariantSupported(gpt54, { id: "max" })).toBe(false);
  });

  it("returns false for a disabled variant id", () => {
    const model = makeModel({
      variants: { low: { disabled: true }, high: {} },
    });
    expect(isModelVariantSupported(model, { id: "low" })).toBe(false);
    expect(isModelVariantSupported(model, { id: "high" })).toBe(true);
  });

  it("is conservative for a null / undefined model: cannot verify, so reject", () => {
    // If the model is not yet available, we have no metadata to verify
    // against. The helper takes the conservative "no metadata = no
    // support" path, consistent with `validateModelVariant` clearing the
    // prior effort in the same situation. Callers should not send a
    // guessed effort; clearing is the spec-aligned default.
    expect(isModelVariantSupported(null, { id: "low" })).toBe(false);
    expect(isModelVariantSupported(undefined, { id: "low" })).toBe(false);
  });
});

// ============================================================
// validateModelVariant (model-change invalidation)
// ============================================================

describe("validateModelVariant", () => {
  it("returns undefined for unset effort (no override)", () => {
    expect(validateModelVariant(gpt54, undefined)).toBeUndefined();
    // `null` is treated the same as `undefined`: it is a typecheck guard
    // for callers that may pass `null` from a nullable store.
    expect(validateModelVariant(gpt54, null as unknown as undefined)).toBeUndefined();
  });

  it("keeps the same supported id when the model changes", () => {
    const prior: ModelVariantRef = { id: "low" };
    const result = validateModelVariant(gpt54, prior);
    expect(result).toBeDefined();
    expect(result?.id).toBe("low");
  });

  it("returns a normalized ref with label when the model advertises it", () => {
    const result = validateModelVariant(deepseekV4Pro, { id: "low" });
    expect(result).toEqual({ id: "low", label: "Low" });
  });

  it("clears an unsupported prior id when the model changes", () => {
    // "max" is DeepSeek-only; the new model is a reasoning-only one.
    const result = validateModelVariant(deepseekReasoner, { id: "max" });
    expect(result).toBeUndefined();
  });

  it("clears an unsupported prior id when the new model has a different set", () => {
    // "low" exists on gpt-5.4 but DeepSeek-reasoner has no variants at all.
    const result = validateModelVariant(deepseekReasoner, { id: "low" });
    expect(result).toBeUndefined();
  });

  it("clears a prior id that became disabled after metadata refresh", () => {
    const model = makeModel({
      variants: { low: { label: "Low", disabled: true } },
    });
    expect(validateModelVariant(model, { id: "low" })).toBeUndefined();
  });

  it("returns a fresh object so callers cannot mutate the helper's internal list", () => {
    const supported = getModelVariants(gpt54);
    const first = supported[0];
    const result = validateModelVariant(gpt54, { id: first.id });
    expect(result).not.toBe(first);
    expect(result).toEqual(first);
  });

  it("treats missing model as no supported ids (clears prior effort)", () => {
    expect(validateModelVariant(null, { id: "low" })).toBeUndefined();
    expect(validateModelVariant(undefined, { id: "low" })).toBeUndefined();
  });
});
