import type { ModelVariantRef, ProviderInfo as CoreProviderInfo } from "@opencodegui/core";
import { useMemo, useState } from "react";
import { useLocale } from "../../../locales";
import type { AllProvidersData, ModelInfo, ProviderInfo } from "../../../vscode-api";
import { ChevronRightIcon, EyeIcon, EyeOffIcon } from "../../atoms/icons";
import { LinkButton } from "../../atoms/LinkButton";
import { Popover } from "../../atoms/Popover";
import styles from "./ModelSelector.module.css";

type Props = {
  providers: CoreProviderInfo[];
  allProvidersData: AllProvidersData | null;
  selectedModel: { providerID: string; modelID: string } | null;
  onSelect: (model: { providerID: string; modelID: string }) => void;
  /**
   * Optional explicit model effort/variant for the selected model.
   * When unset, the selector shows only the model name (no separator
   * or placeholder like "default"). When set, the effort label (or
   * id fallback) is rendered compactly next to the model name with a
   * middle-dot separator. Display-only; click handling lives elsewhere.
   */
  selectedModelEffort?: ModelVariantRef;
};

function formatContextK(context: number): string {
  if (context >= 1_000_000) return `${(context / 1_000_000).toFixed(0)}M`;
  return `${Math.round(context / 1000)}K`;
}

function statusBadge(status?: string): string | null {
  if (!status || status === "active") return null;
  return status;
}

const badgeClass: Record<string, string> = {
  beta: styles.beta,
  alpha: styles.alpha,
  deprecated: styles.deprecated,
};

export function ModelSelector({
  providers,
  allProvidersData,
  selectedModel,
  onSelect,
  selectedModelEffort,
}: Props) {
  const t = useLocale();
  const [collapsedProviders, setCollapsedProviders] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);

  // 表示用プロバイダーリスト: allProvidersData があればそちらを使い、なければ従来の providers を使う
  const allDisplayProviders = useMemo(() => {
    if (!allProvidersData) {
      return providers.map((p) => ({
        id: p.id,
        name: p.name,
        connected: true,
        models: Object.values(p.models).map((m) => ({
          id: m.id,
          name: m.name,
          limit: m.limit,
          status: m.status === "active" ? undefined : m.status,
        })),
      }));
    }

    const connectedSet = new Set(allProvidersData.connected);
    return allProvidersData.all
      .filter((p: ProviderInfo) => Object.keys(p.models).length > 0)
      .map((p: ProviderInfo) => ({
        id: p.id,
        name: p.name,
        connected: connectedSet.has(p.id),
        models: Object.values(p.models).map((m: ModelInfo) => ({
          id: m.id,
          name: m.name,
          limit: m.limit,
          status: m.status,
        })),
      }));
  }, [providers, allProvidersData]);

  // showAll が false のときは connected なプロバイダーのみ
  const displayProviders = useMemo(() => {
    if (showAll) return allDisplayProviders;
    return allDisplayProviders.filter((p) => p.connected);
  }, [allDisplayProviders, showAll]);

  const hasDisconnected = useMemo(() => allDisplayProviders.some((p) => !p.connected), [allDisplayProviders]);

  const selectedModelName = useMemo(() => {
    if (!selectedModel) return t["model.selectModel"];
    for (const p of allDisplayProviders) {
      const model = p.models.find((m) => m.id === selectedModel.modelID && p.id === selectedModel.providerID);
      if (model) return model.name || selectedModel.modelID;
    }
    return selectedModel.modelID;
  }, [selectedModel, allDisplayProviders, t["model.selectModel"]]);

  // Effort display text. Prefer the normalized `label`; fall back to `id`.
  // Only render when both a model is selected and an explicit effort is set.
  // The label is intentionally compact (e.g. "Low" / "Medium" / "High") and
  // uses a middle-dot separator so the rendered text reads as
  // "GPT-5.4 · Low" without dominating the model name.
  const selectedModelEffortText = useMemo(() => {
    if (!selectedModel) return null;
    if (!selectedModelEffort) return null;
    return selectedModelEffort.label || selectedModelEffort.id;
  }, [selectedModel, selectedModelEffort]);

  const toggleProvider = (id: string) => {
    setCollapsedProviders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <Popover
      className={styles.root}
      trigger={({ open, toggle }) => (
        <button type="button" className={styles.button} onClick={toggle} title={t["model.selectModel"]}>
          <span className={styles.label}>
            <span className={styles.modelName}>{selectedModelName}</span>
            {selectedModelEffortText && (
              <>
                <span className={styles.separator} aria-hidden="true">
                  ·
                </span>
                <span className={styles.effort} title={`effort: ${selectedModelEffortText}`}>
                  {selectedModelEffortText}
                </span>
              </>
            )}
          </span>
          <span className={`${styles.chevron} ${open ? styles.expanded : ""}`}>
            <ChevronRightIcon />
          </span>
        </button>
      )}
      panel={({ close }) => (
        <div className={styles.panel}>
          <div className={styles.panelBody}>
            {displayProviders.map((provider) => {
              if (provider.models.length === 0) return null;
              const isCollapsed = collapsedProviders.has(provider.id);
              return (
                <div key={provider.id} className={styles.section}>
                  <div
                    className={`${styles.sectionTitle} ${!provider.connected ? styles.disconnected : ""}`}
                    onClick={() => toggleProvider(provider.id)}
                  >
                    <span className={`${styles.chevron} ${isCollapsed ? "" : styles.expanded}`}>
                      <ChevronRightIcon />
                    </span>
                    <span className={styles.sectionName}>{provider.name}</span>
                    {!provider.connected && <span className={styles.sectionBadge}>{t["model.notConnected"]}</span>}
                  </div>
                  {!isCollapsed &&
                    provider.models.map((model) => {
                      const isSelected =
                        selectedModel?.providerID === provider.id && selectedModel?.modelID === model.id;
                      const disabled = !provider.connected;
                      const badge = statusBadge(model.status);
                      return (
                        <div
                          key={model.id}
                          className={[styles.item, isSelected && styles.active, disabled && styles.disabled]
                            .filter(Boolean)
                            .join(" ")}
                          onClick={() => {
                            if (disabled) return;
                            onSelect({ providerID: provider.id, modelID: model.id });
                            close();
                          }}
                        >
                          <span className={styles.itemCheck}>{isSelected ? "✓" : ""}</span>
                          <span className={styles.itemName}>
                            {model.name || model.id}
                            {badge && <span className={`${styles.itemBadge} ${badgeClass[badge] ?? ""}`}>{badge}</span>}
                          </span>
                          {model.limit && (
                            <span className={styles.itemMeta}>
                              <span className={styles.itemContext}>{formatContextK(model.limit.context)}</span>
                            </span>
                          )}
                        </div>
                      );
                    })}
                </div>
              );
            })}
          </div>
          {hasDisconnected && (
            <div className={styles.footer}>
              <LinkButton
                onClick={() => setShowAll((s) => !s)}
                title={showAll ? t["model.hideDisconnected"] : t["model.showAll"]}
              >
                {showAll ? <EyeIcon /> : <EyeOffIcon />}
                <span>{showAll ? t["model.connectedOnly"] : t["model.showAll"]}</span>
              </LinkButton>
            </div>
          )}
        </div>
      )}
    />
  );
}
