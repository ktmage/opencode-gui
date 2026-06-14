import type { AllProvidersData, ModelInfo, ProviderInfo } from "@opencodegui/core";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useProviders } from "../../hooks/useProviders";
import { postMessage } from "../../vscode-api";

// ============================================================
// Test fixtures (synthetic providers / models with variants)
// ============================================================
//
// Per task 2.1: "Use synthetic providers/allProvidersData with
// `variants` maps; do not hardcode effort lists except in test
// fixtures as metadata keys."

// OpenAI gpt-5.4 style: full {low, medium, high} variant set.
const gpt54: ModelInfo = {
  id: "openai/gpt-5.4",
  name: "GPT-5.4",
  limit: { context: 0, output: 0 },
  variants: {
    low: { label: "Low" },
    medium: { label: "Medium" },
    high: { label: "High" },
  },
};

// OpenAI gpt-5.4-mini: subset of gpt-5.4's variants but still
// shares the "low" id, so a switch from gpt-5.4 must keep it.
const gpt54Mini: ModelInfo = {
  id: "openai/gpt-5.4-mini",
  name: "GPT-5.4 Mini",
  limit: { context: 0, output: 0 },
  variants: {
    low: { label: "Low" },
    medium: { label: "Medium" },
  },
};

// Anthropic claude-opus: different variant set entirely.
const claudeOpus: ModelInfo = {
  id: "anthropic/claude-opus",
  name: "Claude Opus",
  limit: { context: 0, output: 0 },
  variants: {
    low: { label: "Low" },
    medium: { label: "Medium" },
    // no "high" — switching to this with prior "high" effort must clear.
  },
};

// DeepSeek deepseek-reasoner: reasoning-only model with no variants.
// Mirrors the live probe finding (deepseek-reasoner has no variants).
const deepseekReasoner: ModelInfo = {
  id: "deepseek/deepseek-reasoner",
  name: "DeepSeek Reasoner",
  reasoning: true,
  limit: { context: 0, output: 0 },
  // intentionally no variants
};

const openaiProvider: ProviderInfo = {
  id: "openai",
  name: "OpenAI",
  env: [],
  models: {
    "gpt-5.4": gpt54,
    "gpt-5.4-mini": gpt54Mini,
  },
};

const anthropicProvider: ProviderInfo = {
  id: "anthropic",
  name: "Anthropic",
  env: [],
  models: {
    "claude-opus": claudeOpus,
  },
};

const deepseekProvider: ProviderInfo = {
  id: "deepseek",
  name: "DeepSeek",
  env: [],
  models: {
    "deepseek-reasoner": deepseekReasoner,
  },
};

const allProvidersDataFixture: AllProvidersData = {
  all: [openaiProvider, anthropicProvider, deepseekProvider],
  default: {},
  connected: ["openai", "anthropic", "deepseek"],
};

describe("useProviders", () => {
  // initial state
  context("初期状態の場合", () => {
    // providers is empty
    it("providers が空配列であること", () => {
      const { result } = renderHook(() => useProviders());
      expect(result.current.providers).toEqual([]);
    });

    // selectedModel is null
    it("selectedModel が null であること", () => {
      const { result } = renderHook(() => useProviders());
      expect(result.current.selectedModel).toBeNull();
    });

    // allProvidersData is null
    it("allProvidersData が null であること", () => {
      const { result } = renderHook(() => useProviders());
      expect(result.current.allProvidersData).toBeNull();
    });

    // 1. initial selected effort is unset
    // - "Preserve default effort until explicitly selected" requirement
    it("selectedModelEffort が undefined であること", () => {
      const { result } = renderHook(() => useProviders());
      expect(result.current.selectedModelEffort).toBeUndefined();
    });
  });

  // handleModelSelect
  context("handleModelSelect を呼んだ場合", () => {
    // updates selectedModel
    it("selectedModel が更新されること", () => {
      const { result } = renderHook(() => useProviders());
      const model = { providerID: "openai", modelID: "gpt-4" };
      act(() => result.current.handleModelSelect(model));
      expect(result.current.selectedModel).toEqual(model);
    });

    // sends setModel message
    it("setModel メッセージを送信すること", () => {
      const { result } = renderHook(() => useProviders());
      const model = { providerID: "openai", modelID: "gpt-4" };
      act(() => result.current.handleModelSelect(model));
      expect(postMessage).toHaveBeenCalledWith({ type: "setModel", model: "openai/gpt-4" });
    });
  });

  // setters
  context("setters でステートを更新する場合", () => {
    // setProviders updates providers
    it("setProviders で providers を設定できること", () => {
      const { result } = renderHook(() => useProviders());
      const providers = [{ id: "anthropic", models: {} }] as any[];
      act(() => result.current.setProviders(providers));
      expect(result.current.providers).toEqual(providers);
    });

    // setAllProvidersData updates allProvidersData
    it("setAllProvidersData で allProvidersData を設定できること", () => {
      const { result } = renderHook(() => useProviders());
      const data = { anthropic: { name: "Anthropic", models: {} } } as any;
      act(() => result.current.setAllProvidersData(data));
      expect(result.current.allProvidersData).toEqual(data);
    });

    // setSelectedModel with function updater
    it("setSelectedModel に関数を渡してモデルを設定できること", () => {
      const { result } = renderHook(() => useProviders());
      act(() => result.current.setSelectedModel(() => ({ providerID: "openai", modelID: "gpt-4o" })));
      expect(result.current.selectedModel).toEqual({ providerID: "openai", modelID: "gpt-4o" });
    });
  });

  // effort state — initial + explicit selection
  context("effort state の場合", () => {
    // 2. setting/selecting an explicit supported effort stores normalized state
    context("サポートされた effort を setSelectedModelEffort で設定した場合", () => {
      it("label を含む normalized な state を保存すること", () => {
        const { result } = renderHook(() => useProviders());
        act(() => result.current.setAllProvidersData(allProvidersDataFixture));
        act(() => result.current.setSelectedModel({ providerID: "openai", modelID: "gpt-5.4" }));
        act(() => result.current.setSelectedModelEffort({ id: "low" }));
        expect(result.current.selectedModelEffort).toEqual({ id: "low", label: "Low" });
      });

      it("label が存在しない variant は id のみを保存すること", () => {
        const { result } = renderHook(() => useProviders());
        // Use a model where one variant has no label/name/title.
        const bareModel: ModelInfo = {
          id: "openai/gpt-bare",
          name: "Bare",
          limit: { context: 0, output: 0 },
          variants: { minimal: { reasoningEffort: "minimal" } },
        };
        const data: AllProvidersData = {
          all: [{ id: "openai", name: "OpenAI", env: [], models: { "gpt-bare": bareModel } }],
          default: {},
          connected: ["openai"],
        };
        act(() => result.current.setAllProvidersData(data));
        act(() => result.current.setSelectedModel({ providerID: "openai", modelID: "gpt-bare" }));
        act(() => result.current.setSelectedModelEffort({ id: "minimal" }));
        expect(result.current.selectedModelEffort).toEqual({ id: "minimal" });
      });

      it("モデルが未選択の場合、effort は保存されず undefined のままとなること", () => {
        // Spec: do not guess effort when no model is selected.
        const { result } = renderHook(() => useProviders());
        act(() => result.current.setAllProvidersData(allProvidersDataFixture));
        // Note: no setSelectedModel call.
        act(() => result.current.setSelectedModelEffort({ id: "low" }));
        expect(result.current.selectedModelEffort).toBeUndefined();
      });

      it("undefined を渡して effort をクリアできること", () => {
        const { result } = renderHook(() => useProviders());
        act(() => result.current.setAllProvidersData(allProvidersDataFixture));
        act(() => result.current.setSelectedModel({ providerID: "openai", modelID: "gpt-5.4" }));
        act(() => result.current.setSelectedModelEffort({ id: "low" }));
        act(() => result.current.setSelectedModelEffort(undefined));
        expect(result.current.selectedModelEffort).toBeUndefined();
      });
    });
  });

  // effort invalidation on model change
  context("選択モデルを変更した場合", () => {
    // 3. switching to a model that supports the same effort keeps it
    it("同じ effort id をサポートするモデルへ切り替えると effort が維持されること", () => {
      const { result } = renderHook(() => useProviders());
      act(() => result.current.setAllProvidersData(allProvidersDataFixture));
      act(() => result.current.setSelectedModel({ providerID: "openai", modelID: "gpt-5.4" }));
      act(() => result.current.setSelectedModelEffort({ id: "low" }));
      expect(result.current.selectedModelEffort).toEqual({ id: "low", label: "Low" });

      // gpt-5.4-mini also supports "low"; effort must be preserved.
      act(() => result.current.setSelectedModel({ providerID: "openai", modelID: "gpt-5.4-mini" }));
      expect(result.current.selectedModel).toEqual({ providerID: "openai", modelID: "gpt-5.4-mini" });
      expect(result.current.selectedModelEffort).toBeDefined();
      expect(result.current.selectedModelEffort?.id).toBe("low");
    });

    // 4. switching to a model that does not support the prior effort clears it
    it("prior effort をサポートしないモデルへ切り替えると effort がクリアされること", () => {
      const { result } = renderHook(() => useProviders());
      act(() => result.current.setAllProvidersData(allProvidersDataFixture));
      act(() => result.current.setSelectedModel({ providerID: "openai", modelID: "gpt-5.4" }));
      act(() => result.current.setSelectedModelEffort({ id: "high" }));
      expect(result.current.selectedModelEffort?.id).toBe("high");

      // anthropic/claude-opus has no "high" variant — effort must be cleared.
      act(() => result.current.setSelectedModel({ providerID: "anthropic", modelID: "claude-opus" }));
      expect(result.current.selectedModelEffort).toBeUndefined();
    });

    // 5. switching to a reasoning-only/no-variants model clears it and does not guess
    it("variants がない reasoning-only モデルへ切り替えると effort がクリアされ、推測もしないこと", () => {
      const { result } = renderHook(() => useProviders());
      act(() => result.current.setAllProvidersData(allProvidersDataFixture));
      act(() => result.current.setSelectedModel({ providerID: "openai", modelID: "gpt-5.4" }));
      act(() => result.current.setSelectedModelEffort({ id: "low" }));
      expect(result.current.selectedModelEffort?.id).toBe("low");

      // deepseek-reasoner: reasoning: true but no variants map.
      // The GUI must clear, not invent an effort value.
      act(() => result.current.setSelectedModel({ providerID: "deepseek", modelID: "deepseek-reasoner" }));
      expect(result.current.selectedModelEffort).toBeUndefined();
    });

    // 7a. direct setSelectedModel value-form invalidates effort
    it("setSelectedModel を値形式で呼んだ場合も effort が invalidate されること", () => {
      const { result } = renderHook(() => useProviders());
      act(() => result.current.setAllProvidersData(allProvidersDataFixture));
      act(() => result.current.setSelectedModel({ providerID: "openai", modelID: "gpt-5.4" }));
      act(() => result.current.setSelectedModelEffort({ id: "high" }));

      // Direct value-form path (App.tsx pattern).
      act(() => result.current.setSelectedModel({ providerID: "anthropic", modelID: "claude-opus" }));
      expect(result.current.selectedModel).toEqual({ providerID: "anthropic", modelID: "claude-opus" });
      expect(result.current.selectedModelEffort).toBeUndefined();
    });

    // 7b. direct setSelectedModel function-form invalidates effort
    it("setSelectedModel を関数形式で呼んだ場合も effort が invalidate されること", () => {
      const { result } = renderHook(() => useProviders());
      act(() => result.current.setAllProvidersData(allProvidersDataFixture));
      act(() => result.current.setSelectedModel({ providerID: "openai", modelID: "gpt-5.4" }));
      act(() => result.current.setSelectedModelEffort({ id: "high" }));

      // Direct function-form path (App.tsx pattern in the "providers" handler).
      act(() =>
        result.current.setSelectedModel(() => ({
          providerID: "anthropic",
          modelID: "claude-opus",
        })),
      );
      expect(result.current.selectedModel).toEqual({ providerID: "anthropic", modelID: "claude-opus" });
      expect(result.current.selectedModelEffort).toBeUndefined();
    });

    // 6. existing selected model behavior and setModel postMessage still works
    context("既存挙動 (handleModelSelect 経由)", () => {
      it("setModel postMessage はそのまま送信されること", () => {
        const { result } = renderHook(() => useProviders());
        act(() => result.current.setAllProvidersData(allProvidersDataFixture));
        act(() => result.current.handleModelSelect({ providerID: "openai", modelID: "gpt-5.4" }));
        expect(postMessage).toHaveBeenCalledWith({ type: "setModel", model: "openai/gpt-5.4" });
      });

      it("handleModelSelect 後のモデル変更で effort が invalidate されること", () => {
        const { result } = renderHook(() => useProviders());
        act(() => result.current.setAllProvidersData(allProvidersDataFixture));
        act(() => result.current.handleModelSelect({ providerID: "openai", modelID: "gpt-5.4" }));
        act(() => result.current.setSelectedModelEffort({ id: "high" }));
        // Switch to a model without "high" via handleModelSelect.
        act(() => result.current.handleModelSelect({ providerID: "deepseek", modelID: "deepseek-reasoner" }));
        expect(result.current.selectedModel).toEqual({ providerID: "deepseek", modelID: "deepseek-reasoner" });
        expect(result.current.selectedModelEffort).toBeUndefined();
      });
    });
  });

  // effort revalidation on metadata change
  context("プロバイダメタデータが更新された場合", () => {
    it("サポートされている effort は維持されること", () => {
      const { result } = renderHook(() => useProviders());
      act(() => result.current.setAllProvidersData(allProvidersDataFixture));
      act(() => result.current.setSelectedModel({ providerID: "openai", modelID: "gpt-5.4" }));
      act(() => result.current.setSelectedModelEffort({ id: "low" }));
      expect(result.current.selectedModelEffort).toEqual({ id: "low", label: "Low" });

      // Refresh allProvidersData with a new reference but identical content.
      act(() => result.current.setAllProvidersData({ ...allProvidersDataFixture }));
      expect(result.current.selectedModelEffort).toEqual({ id: "low", label: "Low" });
    });

    it("新たに unsupported (disabled) になった effort はクリアされること", () => {
      const { result } = renderHook(() => useProviders());
      act(() => result.current.setAllProvidersData(allProvidersDataFixture));
      act(() => result.current.setSelectedModel({ providerID: "openai", modelID: "gpt-5.4" }));
      act(() => result.current.setSelectedModelEffort({ id: "low" }));
      expect(result.current.selectedModelEffort?.id).toBe("low");

      // Simulate metadata refresh: "low" becomes disabled on this model.
      const refreshed: AllProvidersData = {
        ...allProvidersDataFixture,
        all: allProvidersDataFixture.all.map((p) =>
          p.id === "openai"
            ? {
                ...p,
                models: {
                  ...p.models,
                  "gpt-5.4": {
                    ...gpt54,
                    variants: {
                      low: { label: "Low", disabled: true },
                      medium: { label: "Medium" },
                      high: { label: "High" },
                    },
                  },
                },
              }
            : p,
        ),
      };
      act(() => result.current.setAllProvidersData(refreshed));
      expect(result.current.selectedModelEffort).toBeUndefined();
    });
  });
});
