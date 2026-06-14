import type { ModelInfo, ModelVariantRef, ProviderInfo } from "@opencodegui/core";
import { validateModelVariant } from "@opencodegui/core";
import { useCallback, useEffect, useState } from "react";
import type { AllProvidersData } from "../vscode-api";
import { postMessage } from "../vscode-api";

type SelectedModel = { providerID: string; modelID: string };

/**
 * Webview provider/model state.
 *
 * Tracks the currently selected model plus an optional explicit
 * model effort/variant for that model. The effort state is
 * intentionally additive: when unset, the GUI sends no effort
 * override and opencode applies its own default behavior. When
 * set, the value is normalized from `ModelInfo.variants` so it
 * always reflects what the model actually advertises.
 *
 * The hook centralizes effort invalidation rules for the
 * `model-effort-control` capability:
 *
 * - When the selected model changes, prior effort that the new
 *   model does not advertise is cleared.
 * - When provider metadata for the selected model changes (a
 *   variant id disappears or becomes `disabled: true`), the same
 *   invalidation runs.
 * - The exposed `setSelectedModelEffort` validates the requested
 *   effort against the current model metadata before storing, so
 *   callers always observe a normalized value or `undefined`.
 *
 * Existing provider/model-only behavior is preserved: callers that
 * never touch `selectedModelEffort` see no effort in any downstream
 * payload (this change does not yet wire effort into protocol
 * messages; that is task 3.1+).
 */
export function useProviders() {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [allProvidersData, setAllProvidersData] = useState<AllProvidersData | null>(null);
  const [selectedModel, setSelectedModel] = useState<SelectedModel | null>(null);
  const [selectedModelEffort, setSelectedModelEffortRaw] = useState<ModelVariantRef | undefined>(undefined);

  // Centralized revalidation: when the selected model or provider
  // metadata changes, validate the existing effort against the new
  // metadata. Keep if supported; clear if not. This single effect
  // covers both model-change and metadata-refresh invalidation.
  // - "Validate effort when the selected model changes" requirement.
  useEffect(() => {
    const info = findModelInfo(selectedModel, allProvidersData, providers);
    setSelectedModelEffortRaw((prev) => (prev ? validateModelVariant(info, prev) : prev));
  }, [selectedModel, allProvidersData, providers]);

  const handleModelSelect = useCallback((model: SelectedModel) => {
    setSelectedModel(model);
    postMessage({ type: "setModel", model: `${model.providerID}/${model.modelID}` });
  }, []);

  // Public setter for explicit effort selection. Validates against
  // the currently selected model so the stored state is always
  // normalized (id + label from the model's metadata). Pass
  // `undefined` / `null` to clear the selection.
  // - "Preserve default effort until explicitly selected" requirement.
  const setSelectedModelEffort = useCallback(
    (effort: ModelVariantRef | null | undefined) => {
      if (!effort) {
        setSelectedModelEffortRaw(undefined);
        return;
      }
      const info = findModelInfo(selectedModel, allProvidersData, providers);
      setSelectedModelEffortRaw(validateModelVariant(info, effort));
    },
    [selectedModel, allProvidersData, providers],
  );

  return {
    providers,
    setProviders,
    allProvidersData,
    setAllProvidersData,
    selectedModel,
    setSelectedModel,
    selectedModelEffort,
    setSelectedModelEffort,
    handleModelSelect,
  } as const;
}

// ============================================================
// Internal helpers
// ============================================================

/**
 * Resolve the full `ModelInfo` for a `{ providerID, modelID }` pair
 * from the most authoritative available source.
 *
 * - Prefers `allProvidersData.all` (which carries the `variants` map
 *   and is the source of truth for effort choices).
 * - Falls back to `providers` (the connected-only list) when the
 *   all-providers payload is missing or doesn't contain the target.
 *
 * Returns `null` when the model cannot be resolved from either
 * source. Callers must treat that as "no metadata available" and
 * clear any prior effort rather than guess from the id.
 */
function findModelInfo(
  target: SelectedModel | null,
  allProvidersData: AllProvidersData | null,
  providers: ProviderInfo[],
): ModelInfo | null {
  if (!target) return null;
  const lookup = (list: ProviderInfo[] | null | undefined): ModelInfo | null => {
    if (!list) return null;
    for (const provider of list) {
      if (provider.id !== target.providerID) continue;
      const model = provider.models?.[target.modelID];
      if (model) return model;
    }
    return null;
  };
  return lookup(allProvidersData?.all) ?? lookup(providers);
}
