/**
 * @opencodegui/core - model effort helpers
 *
 * Normalized helpers that derive GUI-friendly effort/variant choices from
 * server-provided model metadata. The helpers deliberately do NOT guess
 * effort values from `reasoning: true`, provider id, or model id. An empty
 * result means "effort is unsupported for this model" and the GUI must
 * leave effort unset in that case.
 *
 * Companion types are defined alongside `ModelRef` in `./domain.ts`.
 */
import type { ModelInfo, ModelVariantRef } from "./domain";

/**
 * Return the normalized, non-disabled variant refs that a model advertises
 * through `ModelInfo.variants`.
 *
 * - Reads only `model.variants`; never infers from `reasoning`, provider
 *   id, or model id.
 * - Preserves server-supplied variant order (JS object entry order for
 *   string keys) so the cycling order in the UI matches the server's
 *   declared order.
 * - Filters out variants whose value has `disabled === true`, defensively,
 *   for SDK evolution.
 * - May pick up a display `label` from a top-level string `label`, `name`,
 *   or `title` field on the variant value, but does not depend on
 *   provider-specific nested request options.
 * - Returns an empty array for `undefined` / `null` / missing / non-object
 *   `variants`. Empty result means "effort is unsupported for this model".
 */
export function getModelVariants(
  model?: ModelInfo | null,
): ModelVariantRef[] {
  if (!model) return [];
  const raw = model.variants;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];

  const result: ModelVariantRef[] = [];
  for (const [id, value] of Object.entries(raw)) {
    if (!isPlainObject(value)) continue;
    if (value.disabled === true) continue;
    const label = pickDisplayLabel(value);
    const ref: ModelVariantRef = label !== undefined ? { id, label } : { id };
    result.push(ref);
  }
  return result;
}

/**
 * Return true when the given effort is valid for the given model.
 *
 * - Unset effort (`undefined` / `null`) is always considered valid so the
 *   default "no override" payload is always allowed.
 * - An effort whose `id` is not advertised by the model returns false,
 *   signaling that the prior selection should be cleared on model change.
 */
export function isModelVariantSupported(
  model: ModelInfo | undefined | null,
  effort: ModelVariantRef | undefined | null,
): boolean {
  if (!effort) return true;
  return getModelVariants(model).some((v) => v.id === effort.id);
}

/**
 * Validate the selected explicit effort against the currently selected
 * model. Centralizes the model-change invalidation rules:
 *
 * - Unset effort (`undefined` / `null`) returns `undefined`. Callers must
 *   not invent a default.
 * - When the model advertises the effort id, return a normalized ref
 *   derived from the model's metadata (id plus optional label). A fresh
 *   object is returned so callers cannot mutate the helper's internal
 *   list.
 * - When the model does not advertise the effort id, return `undefined`
 *   so the caller clears the prior selection.
 */
export function validateModelVariant(
  model: ModelInfo | undefined | null,
  effort: ModelVariantRef | undefined | null,
): ModelVariantRef | undefined {
  if (!effort) return undefined;
  const supported = getModelVariants(model);
  const match = supported.find((v) => v.id === effort.id);
  return match ? { ...match } : undefined;
}

// ============================================================
// Internal helpers
// ============================================================

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pickDisplayLabel(
  value: Record<string, unknown>,
): string | undefined {
  for (const field of DISPLAY_LABEL_FIELDS) {
    const candidate = value[field];
    if (typeof candidate === "string" && candidate.length > 0) {
      return candidate;
    }
  }
  return undefined;
}

const DISPLAY_LABEL_FIELDS = ["label", "name", "title"] as const;
