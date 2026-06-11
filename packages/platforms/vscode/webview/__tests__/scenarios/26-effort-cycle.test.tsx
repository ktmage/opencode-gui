/**
 * Ctrl+T effort cycling scenarios.
 *
 * task 2.3: Add `Ctrl+T` handling in the message input to cycle valid
 * efforts only when supported; verify shortcut behavior with React
 * Testing Library and ensure Enter, IME, popup navigation, and input
 * history tests still pass.
 *
 * Each scenario uses a synthetic `variants` map; no hardcoded provider
 * effort lists leak into production code. `defaultPrevented` and the
 * rendered `ModelSelector` label (`.effort`, `.separator`, `.modelName`
 * CSS-module classes) are the canonical observables for the cycle
 * action. Send/edit payloads are intentionally NOT inspected here —
 * that lives in task 3.1+.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InputArea } from "../../components/organisms/InputArea/InputArea";
import { createAllProvidersData, createProvider, createSession } from "../factories";
import { renderApp, sendExtMessage } from "../helpers";

// ============================================================
// Synthetic provider fixtures
// ============================================================
//
// The GUI only reads `variants` keys; nothing about provider names or
// model ids is hardcoded in production code. The "reasoning-only"
// fixture is the same shape as the live-probe `deepseek-reasoner`
// (reasoning: true, no variants) and must remain unsupported for
// cycling per the discovery findings.

const openaiAllProvider = {
  id: "openai",
  name: "OpenAI",
  env: [],
  models: {
    // Full {low, medium, high} cycle.
    "gpt-5.4": {
      id: "gpt-5.4",
      name: "GPT-5.4",
      limit: { context: 128000, output: 4096 },
      variants: {
        low: { label: "Low" },
        medium: { label: "Medium" },
        high: { label: "High" },
      },
    },
    // Single-variant set: a cycle is still allowed and wraps to the
    // first/only entry.
    "gpt-5.4-mini": {
      id: "gpt-5.4-mini",
      name: "GPT-5.4 Mini",
      limit: { context: 128000, output: 4096 },
      variants: {
        minimal: { label: "Minimal" },
      },
    },
    // Reasoning-only, no variants: MUST NOT cycle, MUST NOT show
    // any effort text. Mirrors the deepseek-reasoner fixture.
    "reasoner": {
      id: "reasoner",
      name: "Reasoner",
      reasoning: true,
      limit: { context: 128000, output: 4096 },
    },
  },
};

// Fallback `providers` list carries the same metadata; the cycle
// resolver falls back to this when allProvidersData is missing the
// model (defensive path).
const openaiConnectedProvider = createProvider("openai", {
  "gpt-5.4": {
    id: "gpt-5.4",
    name: "GPT-5.4",
    limit: { context: 128000, output: 4096 },
    variants: {
      low: { label: "Low" },
      medium: { label: "Medium" },
      high: { label: "High" },
    },
  },
  "gpt-5.4-mini": {
    id: "gpt-5.4-mini",
    name: "GPT-5.4 Mini",
    limit: { context: 128000, output: 4096 },
    variants: {
      minimal: { label: "Minimal" },
    },
  },
  "reasoner": {
    id: "reasoner",
    name: "Reasoner",
    reasoning: true,
    limit: { context: 128000, output: 4096 },
  },
});

const deepseekConnectedProvider = createProvider("deepseek", {
  "deepseek-reasoner": {
    id: "deepseek-reasoner",
    name: "DeepSeek Reasoner",
    reasoning: true,
    limit: { context: 128000, output: 4096 },
  },
});

const deepseekAllProvider = {
  id: "deepseek",
  name: "DeepSeek",
  env: [],
  models: {
    "deepseek-reasoner": {
      id: "deepseek-reasoner",
      name: "DeepSeek Reasoner",
      reasoning: true,
      limit: { context: 128000, output: 4096 },
    },
  },
};

// ============================================================
// Setup helpers
// ============================================================

/**
 * Standard setup: render the app, load providers + allProvidersData
 * (with variants), and activate a session so the InputArea is
 * visible. Returns the textarea handle.
 */
async function setupWithVariants(
  defaultModel = "openai/gpt-5.4",
  providers = [openaiConnectedProvider],
  allProvidersRoot = openaiAllProvider,
) {
  renderApp();
  await sendExtMessage({
    type: "providers",
    providers,
    allProviders: createAllProvidersData(
      providers.map((p) => p.id),
      [allProvidersRoot as any],
    ),
    default: { general: defaultModel },
    configModel: defaultModel,
  });
  await sendExtMessage({ type: "activeSession", session: createSession({ id: "s1" }) });
  const textarea = screen.getByPlaceholderText("Ask OpenCode... (type # to attach files)");
  return textarea;
}

/**
 * Returns the rendered text content of the ModelSelector button
 * (the `.label` wrapper in ModelSelector.module.css). This is
 * how the GUI exposes the cycled effort to the user.
 */
function getModelButtonText(): string {
  const label = document.querySelector(".label");
  return label?.textContent ?? "";
}

/**
 * Helper to build minimal but complete props for an isolated
 * `InputArea` render — used by the "no setter wired" scenarios.
 */
function makeBareProps(overrides: Record<string, unknown> = {}) {
  return {
    onSend: vi.fn(),
    onShellExecute: vi.fn(),
    onAbort: vi.fn(),
    isBusy: false,
    providers: [openaiConnectedProvider],
    allProvidersData: createAllProvidersData(["openai"], [openaiAllProvider as any]),
    selectedModel: { providerID: "openai", modelID: "gpt-5.4" },
    onModelSelect: vi.fn(),
    selectedPrimaryAgent: null,
    onPrimaryAgentSelect: vi.fn(),
    openEditors: [],
    activeEditorFile: null,
    workspaceFiles: [],
    prefillText: "",
    onPrefillConsumed: vi.fn(),
    openCodePaths: null,
    onOpenConfigFile: vi.fn(),
    onOpenTerminal: vi.fn(),
    localeSetting: "auto" as any,
    onLocaleSettingChange: vi.fn(),
    soundSettings: {} as any,
    onSoundSettingChange: vi.fn(),
    agents: [],
    skills: [],
    ...overrides,
  };
}

// ============================================================
// Ctrl+T effort cycling
// ============================================================

describe("Ctrl+T による effort サイクル", () => {
  // Reset all mocks between scenarios so sendMessage counts etc. are
  // isolated, even though Ctrl+T itself never sends a protocol
  // message (cycle is purely local state).
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 1. cycling from unset picks the first explicit effort
  context("effort 未選択 + 対応モデルで Ctrl+T を押した場合", () => {
    it("最初の variant が選択されモデル名横に表示されること", async () => {
      const textarea = await setupWithVariants();

      // Baseline: no effort text or separator visible.
      expect(document.querySelector(".effort")).toBeNull();
      expect(document.querySelector(".separator")).toBeNull();

      // Press Ctrl+T.
      fireEvent.keyDown(textarea, { key: "t", ctrlKey: true });

      // First effort is "low" / "Low".
      expect(document.querySelector(".effort")?.textContent).toBe("Low");
      expect(document.querySelector(".separator")).toBeInTheDocument();
      // The button contains both the model name and the effort label.
      expect(getModelButtonText()).toContain("GPT-5.4");
      expect(getModelButtonText()).toContain("Low");
    });

    it("default が preventDefault され、既存のテキスト入力が影響を受けないこと", async () => {
      const textarea = await setupWithVariants();

      // type some text first so we can detect "didn't clobber" afterwards.
      const user = (await import("@testing-library/user-event")).default.setup();
      await user.type(textarea, "draft");

      const event = new KeyboardEvent("keydown", {
        key: "t",
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      // Wrap in act: the keydown handler triggers a React state
      // update in useProviders (setSelectedModelEffort), which would
      // otherwise emit an "act()" warning.
      act(() => {
        textarea.dispatchEvent(event);
      });

      // Cycle happened, default prevented.
      expect(event.defaultPrevented).toBe(true);
      // Existing draft text is untouched.
      expect(textarea).toHaveValue("draft");
    });
  });

  // 2. subsequent Ctrl+T cycles to next effort and wraps
  context("2 回目以降の Ctrl+T", () => {
    it("次の variant へ進み、最後で先頭に戻ること", async () => {
      const textarea = await setupWithVariants();

      // 1st: low
      fireEvent.keyDown(textarea, { key: "t", ctrlKey: true });
      expect(document.querySelector(".effort")?.textContent).toBe("Low");

      // 2nd: medium
      fireEvent.keyDown(textarea, { key: "t", ctrlKey: true });
      expect(document.querySelector(".effort")?.textContent).toBe("Medium");

      // 3rd: high
      fireEvent.keyDown(textarea, { key: "t", ctrlKey: true });
      expect(document.querySelector(".effort")?.textContent).toBe("High");

      // 4th: wraps to low
      fireEvent.keyDown(textarea, { key: "t", ctrlKey: true });
      expect(document.querySelector(".effort")?.textContent).toBe("Low");
    });

    it("variant が 1 つだけのモデルでもサイクルして先頭固定で動作すること", async () => {
      const textarea = await setupWithVariants("openai/gpt-5.4-mini");

      // Cycle once: should land on the only available variant.
      fireEvent.keyDown(textarea, { key: "t", ctrlKey: true });
      expect(document.querySelector(".effort")?.textContent).toBe("Minimal");

      // Cycle again: still the same (wraps to itself).
      fireEvent.keyDown(textarea, { key: "t", ctrlKey: true });
      expect(document.querySelector(".effort")?.textContent).toBe("Minimal");
    });
  });

  // 3. preventDefault only when a valid cycle occurs
  context("preventDefault の挙動", () => {
    it("対応モデルでは preventDefault が呼ばれること", async () => {
      const textarea = await setupWithVariants();
      const event = new KeyboardEvent("keydown", {
        key: "t",
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      act(() => {
        textarea.dispatchEvent(event);
      });
      expect(event.defaultPrevented).toBe(true);
    });

    it("unsupported / variants 不在のモデルでは preventDefault されず effort も表示されないこと", async () => {
      const textarea = await setupWithVariants(
        "deepseek/deepseek-reasoner",
        [deepseekConnectedProvider],
        deepseekAllProvider,
      );

      // Pre-condition: no effort UI present.
      expect(document.querySelector(".effort")).toBeNull();
      expect(document.querySelector(".separator")).toBeNull();

      const event = new KeyboardEvent("keydown", {
        key: "t",
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      // Wrap in act for consistency with the other keydown
      // scenarios; the unsupported path itself doesn't update state
      // but the surrounding render lifecycle still expects the
      // dispatch to be inside a testing act batch.
      act(() => {
        textarea.dispatchEvent(event);
      });

      // Unsupported: no cycle, no preventDefault.
      expect(event.defaultPrevented).toBe(false);
      // No effort rendered.
      expect(document.querySelector(".effort")).toBeNull();
      expect(document.querySelector(".separator")).toBeNull();
    });

    it("Cmd+Ctrl+T (metaKey) はサイクルせず preventDefault もしないこと", async () => {
      const textarea = await setupWithVariants();

      const event = new KeyboardEvent("keydown", {
        key: "t",
        ctrlKey: true,
        metaKey: true,
        bubbles: true,
        cancelable: true,
      });
      act(() => {
        textarea.dispatchEvent(event);
      });

      // Ctrl+Cmd+T (or accidental Cmd+T with ctrlKey) must NOT
      // hijack the user shortcut. We don't prevent default so the
      // platform/browser can still handle Cmd+T (open new tab).
      expect(event.defaultPrevented).toBe(false);
      expect(document.querySelector(".effort")).toBeNull();
    });

    it("Ctrl+Alt+T (altKey) はサイクルせず preventDefault もしないこと", async () => {
      const textarea = await setupWithVariants();

      const event = new KeyboardEvent("keydown", {
        key: "t",
        ctrlKey: true,
        altKey: true,
        bubbles: true,
        cancelable: true,
      });
      act(() => {
        textarea.dispatchEvent(event);
      });

      expect(event.defaultPrevented).toBe(false);
      expect(document.querySelector(".effort")).toBeNull();
    });
  });

  // 4. Ctrl+T does not leak when no setter is wired
  context("onModelEffortSelect が未指定の場合", () => {
    it("サイクルは行われず preventDefault もされないこと", async () => {
      // Render InputArea in isolation with no onModelEffortSelect.
      const props = makeBareProps();
      // Make sure no onModelEffortSelect is present.
      delete (props as any).onModelEffortSelect;
      const view = render(<InputArea {...props} />);
      const textarea = screen.getByPlaceholderText("Ask OpenCode... (type # to attach files)");

      const event = new KeyboardEvent("keydown", {
        key: "t",
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      act(() => {
        textarea.dispatchEvent(event);
      });

      expect(event.defaultPrevented).toBe(false);
      expect(document.querySelector(".effort")).toBeNull();
      view.unmount();
    });

    it("bare な Enter 入力など既存挙動に影響しないこと", async () => {
      // Regression guard: Ctrl+T no-op must not break text entry.
      const user = (await import("@testing-library/user-event")).default.setup();
      const props = makeBareProps();
      delete (props as any).onModelEffortSelect;
      const view = render(<InputArea {...props} />);
      const textarea = screen.getByPlaceholderText("Ask OpenCode... (type # to attach files)");

      await user.type(textarea, "hello");

      // Plain Enter still doesn't fire because text is "hello" (which
      // IS a send) — but use Shift+Enter so we just observe the
      // newline path. The key point is that text content is intact.
      await user.keyboard("{Shift>}{Enter}{/Shift}");
      expect((textarea as HTMLTextAreaElement).value).toContain("hello");
      view.unmount();
    });
  });
});
