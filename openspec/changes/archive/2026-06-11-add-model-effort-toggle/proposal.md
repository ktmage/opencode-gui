## Why

opencode-gui currently lets users choose a provider/model but does not expose opencode TUI model effort controls. For reasoning-capable models, effort controls intelligence, latency, and spend, so GUI users need parity with the TUI `Ctrl+T` workflow without silently changing opencode defaults.

## What Changes

- Add GUI support for model effort selection and cycling for reasoning-capable models.
- Add `Ctrl+T` handling in the VS Code webview input flow to cycle effort for the selected model, matching TUI muscle memory where webview focus allows it.
- Display the currently selected explicit effort near the selected model, while preserving an unset/default state when no effort has been chosen.
- Extend the UI-to-host and core agent contracts so explicit effort/variant can be forwarded to opencode on the **chat prompt** and **edit/resend prompt** flows.
- `executeShell` continues to work as today. The current opencode SDK 1.2.17 `client.session.shell(...)` body has no `variant` field (Discovery Findings §1), so shell sends do not include effort in this change. Shell is therefore a compatibility path: it must remain functional and must not break when an explicit effort is selected in the GUI.
- Validate effort when the selected model changes so invalid prior effort selections are not sent.
- Add tests for default behavior, cycling, model-change validation, and payload propagation.
- No breaking changes to existing provider/model selection, chat send, shell command, or config behavior.

## Capabilities

### New Capabilities
- `model-effort-control`: Users can view, cycle, validate, and send model effort/variant selections from the GUI while preserving opencode defaults unless an explicit effort is selected.

### Modified Capabilities
- None. Existing specs do not cover model/provider selection or send-message behavior.

## Impact

- Affected core contracts:
  - `packages/core/src/domain.ts`
  - `packages/core/src/protocol.ts`
- Affected opencode agent integration:
  - `packages/agents/opencode/src/opencode-agent.ts`
  - related opencode-agent tests
- Affected VS Code webview UI and state:
  - `packages/platforms/vscode/webview/App.tsx`
  - `packages/platforms/vscode/webview/hooks/useProviders.ts`
  - `packages/platforms/vscode/webview/components/organisms/InputArea/InputArea.tsx`
  - `packages/platforms/vscode/webview/components/molecules/ModelSelector/ModelSelector.tsx`
  - locale files if visible labels are added
- Affected VS Code extension host:
  - `packages/platforms/vscode/src/chat-view-provider.ts`
- Test impact:
  - model selection scenarios
  - chat prompt and edit/resend scenarios
  - shell command compatibility scenarios (shell must still work when effort is selected, without sending a variant)
  - opencode-agent send tests

## Non-Goals

- Do not implement a full provider configuration editor.
- Do not persist effort into `opencode.json` unless opencode already does so through the existing API path.
- Do not invent unsupported provider-specific effort names when metadata is unavailable.
- Do not make disconnected providers/models selectable or alter provider connection behavior.
- Do not change backend model/provider persistence code beyond forwarding an explicit per-request effort/variant when available.

## Risks

- The opencode API may expose effort as model variants, request options, or provider-specific model metadata; implementation must verify the actual SDK/API shape before wiring payloads.
- VS Code or the browser may reserve `Ctrl+T` in some focus contexts; webview capture is expected for the textarea but may need an extension-side command/keybinding fallback.
- Provider effort labels differ (`none/minimal/low/medium/high/xhigh`, `low/medium/high/max`, Anthropic thinking budgets), so hardcoding OpenAI-only values would regress non-OpenAI providers.
- Accidentally sending a guessed effort would change user cost/intelligence defaults.

## Fallback

- If provider metadata does not expose valid efforts, keep effort unset and hide/disable effort cycling for that model.
- If `Ctrl+T` cannot be captured reliably in VS Code webviews, keep the visible effort selector clickable and add a VS Code command/keybinding bridge in a later scoped task.
- If opencode request forwarding does not accept effort directly, map explicit effort to the documented variant/model selection mechanism only after verifying the API surface.

## Compatibility

- Existing users with no explicit GUI effort selection MUST retain current opencode behavior.
- Existing persisted selected model state MUST remain readable.
- Existing `sendMessage`, `editAndResend`, `executeShell`, and model selection flows MUST continue to work when effort is absent.
- `executeShell` MUST continue to work when an explicit effort is selected; the GUI does not include effort in the shell payload in this change because the current `client.session.shell(...)` SDK shape does not support it.
- Existing tests for chat send, shell mode, model selection, and provider display MUST continue to pass.
