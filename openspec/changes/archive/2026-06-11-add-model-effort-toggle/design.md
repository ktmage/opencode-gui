## Context

opencode-gui currently has a provider/model selector and sends prompts using a `ModelRef` containing only `providerID` and `modelID`. The send path is:

```
InputArea -> App.handleSend -> UIToHostMessage.sendMessage
          -> chat-view-provider -> IAgent.sendMessage
          -> opencode-agent -> client.session.promptAsync({ model })
```

The GUI displays model reasoning output when opencode returns reasoning parts, but it does not expose the input-side model effort/variant controls available in opencode TUI via `Ctrl+T`. Context7/OpenCode docs indicate model effort is represented through model variants or model `options` such as `reasoningEffort`, but the local GUI code does not currently inspect or forward those fields.

## Goals / Non-Goals

**Goals:**
- Preserve current default behavior unless the user explicitly selects effort.
- Match TUI muscle memory by supporting `Ctrl+T` from the webview message input.
- Derive valid effort choices from opencode/provider metadata rather than hardcoding OpenAI-only values.
- Forward explicit effort/variant through the existing UI protocol and opencode agent integration for the **chat prompt** and **edit/resend prompt** flows.
- Show the selected explicit effort compactly near the selected model.
- Keep the implementation additive and compatible with existing selected model state.
- Preserve existing `executeShell` behavior unchanged: shell commands continue to work, and current opencode SDK does not expose a variant hook for `client.session.shell(...)`, so shell sends do not include effort in this change.

**Non-Goals:**
- Do not create a full model/provider configuration editor.
- Do not write effort into `opencode.json` as a persistent provider option.
- Do not guess provider effort lists when opencode metadata does not expose them.
- Do not alter disconnected-provider behavior or model persistence semantics.

## Decisions

### Decision 1: Represent GUI effort as an explicit optional selection

Use an optional GUI state value such as:

```ts
type ModelEffortSelection = {
  id: string;
  label?: string;
};
```

The unset state means "use opencode default." This is critical because effort maps directly to intelligence, latency, and spend.

Alternatives considered:
- Default to the first listed effort: rejected because it silently changes cost/intelligence.
- Infer defaults from model names: rejected because provider semantics differ and may drift.

### Decision 2: Discover choices through normalized metadata helpers

Add a small helper that accepts the selected provider/model metadata and returns a normalized effort list. The helper should be tolerant of the actual opencode metadata shape after verification.

Expected metadata sources to verify before implementation:
- model-level `variants` with ids/labels and request options
- model-level `options` that includes `reasoningEffort`
- provider/model metadata exposed by `listAllProviders()` but not yet represented in TypeScript types

The helper should initially support verified metadata only. If no verified choices exist, return an empty list and leave effort unsupported for that model.

Alternatives considered:
- Hardcode provider maps for OpenAI/DeepSeek/Anthropic: rejected as brittle and contrary to provider-agnostic GUI behavior.
- Treat `reasoning: true` as enough to expose a default effort set: rejected because not all reasoning models share valid effort identifiers.

### Decision 3: Extend existing contracts additively

The verified opencode SDK 1.2.17 request shape puts `variant?: string` as a **top-level sibling of `model`** on `client.session.promptAsync` and `client.session.command` (see Discovery Findings §1). It does **not** belong inside `ModelRef`. Effort therefore rides as a separate optional field on send options and protocol messages.

Verified additive contract (matches the SDK shape):

```ts
export type ModelVariantRef = {
  id: string;            // variant id (e.g., "low" | "medium" | "high" | provider-specific)
  disabled?: boolean;    // optional; surfaces server-side disabled flag if present
};

export type ModelRef = {
  providerID: string;
  modelID: string;
  // intentionally no effort/variant field — variant travels as a sibling in the wire payload
};

export type ModelInfo = {
  id: string;
  name: string;
  // ... existing fields preserved ...
  variants?: Record<string, Record<string, unknown>>;  // opaque server-provided map
};

export type SendMessageOptions = {
  model?: ModelRef;
  effort?: ModelVariantRef;   // NEW: optional, omitted = opencode default behavior
  files?: FileAttachment[];
  agent?: string;
  primaryAgent?: string;
  skill?: string;
};
```

UI protocol messages that carry a prompt payload (`sendMessage`, `editAndResend`) also grow an optional `effort?: ModelVariantRef`. The opencode agent integration forwards it as the wire-level `variant: effort.id` on `promptAsync` and `command`. `executeShell` is intentionally **not** extended in this change because the current `client.session.shell(...)` body has no `variant` field (Discovery Findings §1); shell continues to use `{ providerID, modelID }` only.

Alternatives considered:
- Add effort only to webview local state and mutate modelID: rejected — opencode variants are selected by id, not by changing the model id.
- Put effort inside `ModelRef` as a nested field: rejected — the SDK wire shape places `variant` outside `model`; nesting would force the agent to unwrap and re-wrap, and the mapper cast is already permissive about field shape.
- Extend `executeShell` with effort: rejected for this change because the SDK 1.2.17 shell body has no `variant` key; revisit on SDK upgrade.

### Decision 4: `Ctrl+T` is handled where text shortcuts already live

Handle `Ctrl+T` in `InputArea.tsx`'s `handleKeyDown`, before popup navigation and Enter send logic. The handler should call a callback such as `onCycleModelEffort` when the selected model supports effort choices.

Implementation notes:
- Use `e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === "t"`.
- Call `e.preventDefault()` only when a cycle action is available, to avoid interfering with unrelated contexts.
- Keep behavior scoped to the textarea/webview focus.

Alternatives considered:
- Global `window.keydown`: rejected initially because it risks shortcut conflicts outside message input.
- VS Code command/keybinding bridge: useful fallback if textarea capture is unreliable, but can be added after verifying webview behavior.

### Decision 5: Display effort compactly in the model selector button

Show explicit effort next to the selected model label, for example `GPT-5.5 · medium`. When effort is unset, show only the model name to avoid implying a non-default choice.

The model selector popover can later expose clickable effort controls, but the first parity slice should prioritize `Ctrl+T`, payload propagation, and visible state.

Alternatives considered:
- Add a separate effort dropdown immediately: larger UI change; defer until keyboard parity and protocol correctness are established.

## Risks / Trade-offs

- **Risk: opencode metadata shape differs from assumptions** -> Mitigation: Step 1.1 ran a sanitized read-only spike against the installed SDK and a live opencode 1.16.2 server; the verified shape is recorded in Discovery Findings (variant map on model metadata, top-level `variant?: string` on `promptAsync` / `command`).
- **Risk: effort forwarding API is not `model.effort`** -> Resolved by Discovery Findings §1: `variant` is a top-level sibling of `model`; the opencode-agent must send `{ ...model, variant: effort.id }` and the existing additive `effort?: ModelVariantRef` option becomes the source of truth.
- **Risk: `Ctrl+T` is intercepted by VS Code or browser** -> Mitigation: test with React Testing Library and real VS Code after VSIX install; if not reliable, add extension-side command/keybinding fallback in a later task.
- **Risk: `client.session.shell(...)` lacks `variant` in SDK 1.2.17** -> Mitigation: shell sends continue to use `{ providerID, modelID }` only and do not include effort in this change. Existing `executeShell` behavior is preserved. Revisit on SDK upgrade.
- **Risk: invalid effort after model switch** -> Mitigation: centralize selected-model/effort validation in provider state hook or App-level derived state.
- **Risk: accidental cost change** -> Mitigation: unset state never sends effort; no guessed defaults; tests assert no effort in default payload.

## Migration Plan

1. Add type and helper support without changing default payloads.
2. Add UI state and `Ctrl+T` cycling for verified metadata.
3. Add payload propagation for explicit effort only.
4. Add display and tests.
5. Build and install VSIX for manual verification.

Rollback path:
- Revert the additive effort fields and UI state changes. Existing model selection and prompt send paths remain compatible because default behavior omits effort.

## Open Questions

- Resolved (Step 1.1): provider model metadata shape — `variants?: Record<string, Record<string, unknown>>` on each model from both `client.config.providers()` and `client.provider.list()` (Discovery Findings §2). Live probe across 12 providers / 687 models confirms the shape and shows that 7 distinct variant ids appear in the wild, with sets varying per model.
- Resolved (Step 1.1): `client.session.promptAsync` request shape — top-level `variant?: string` sibling of `model: { providerID, modelID }` (Discovery Findings §1). `client.session.command` mirrors the same shape.
- Resolved (Step 1.1): `client.session.shell(...)` does not support `variant` in the current SDK 1.2.17 body; shell sends do not carry effort in this change (Discovery Findings §1). Revisit on SDK upgrade.
- Open: does `Ctrl+T` reliably reach the webview textarea in VS Code on macOS, or does it require an extension-side keybinding bridge? (Still requires live VS Code verification after VSIX install.)

## Discovery Findings

Step 1.1 inspected the GUI contracts, the installed opencode SDK types, and ran a sanitized live-server probe. No application source was modified.

### 1. SDK request shape (verified)

Local SDK: `@opencode-ai/sdk` v1.2.17 (`node_modules/.pnpm/@opencode-ai+sdk@1.2.17/.../dist/v2/gen/sdk.gen.d.ts`).

- `client.session.promptAsync(...)` parameters include a top-level `variant?: string` field, separate from `model: { providerID, modelID }`.
  - Evidence: `sdk.gen.d.ts:591-609` — `variant?: string;` listed as a sibling of `model`, `agent`, `noReply`, `tools`, `format`, `system`, `parts`.
- `client.session.command(...)` parameters include `variant?: string`.
  - Evidence: `sdk.gen.d.ts:615-633` — `variant?: string;`.
- `client.session.shell(...)` parameters do **not** include `variant`.
  - Evidence: `sdk.gen.d.ts:639-649` — body has only `agent`, `model?: { providerID; modelID }`, `command`. No `variant` key.
- `client.session.prompt(...)` (synchronous variant) also has `variant?: string`.
  - Evidence: `types.gen.d.ts:2762-2793` (`SessionPromptData.body.variant?: string`).
- Wire-level messages (`UserMessage` / `AssistantMessage`) carry `variant?: string`, confirming the JSON field name.
  - Evidence: `types.gen.d.ts:122` and `types.gen.d.ts:209`.

Conclusion: effort/variant travels as a **sibling of `model`**, not inside it. This invalidates the `ModelRef.effort` sketch in Decision 3 and confirms the SHOULD guidance to keep effort outside `model`.

### 2. Provider metadata shape (verified)

Two metadata endpoints are consumed by the agent:

- `client.config.providers()` → `ConfigProvidersResponses[200] = { providers: Provider[]; default }`.
  - Each `Provider.models[k]` is a `Model` with `variants?: { [key: string]: { [key: string]: unknown } }`.
  - Evidence: `types.gen.d.ts:1294-1361` (`Model.variants?`), and `types.gen.d.ts:1356-1360` (the variants map shape).
- `client.provider.list()` → `ProviderListResponses[200] = { all, default, connected }`.
  - Each `all[i].models[k]` also has `variants?: { [key: string]: { [key: string]: unknown } }`.
  - Evidence: `types.gen.d.ts:3342-3401` (the inline model shape inside `all[]`).

Variant value is an **opaque config bag** (typically `{ reasoningEffort, reasoningSummary, include }` for OpenAI). The GUI does **not** need to read or pass those nested fields — it only needs to forward the variant id; the server applies the internal mapping.

`Model` also exposes `capabilities.reasoning: boolean` and `options: { [key: string]: unknown }`, but `reasoning: true` does **not** imply variants exist. `options` is the provider-config object, not the per-call payload.

### 3. Live-server probe (sanitized)

Commands run (none of these print env vars, tokens, full config, or secret-bearing values):

```bash
# Start an isolated server on a fixed port
opencode serve --port 14192 --hostname 127.0.0.1 --print-logs >/tmp/opencode-probe2.log 2>&1 &
# Hit /config/providers, then sanitize the response with a tiny Node script that
# keeps only provider IDs, model IDs, and variant keys/disabled flags.
curl -s --max-time 5 http://127.0.0.1:14192/config/providers -o /tmp/opencode-providers.json
# (sanitization script: see /var/folders/p_/42dxywxs37b9812bnhsy3jdr0000gn/T/opencode/effort-probe)
kill %1
```

Probe server version: opencode 1.16.2 (matches local SDK family).

Summary of the sanitized output (no model keys/tokens/cost headers printed):

- 12 providers, 687 models total.
- 153 models expose `variants` (non-empty).
- 404 models advertise `capabilities.reasoning: true`; **251 of those have zero variants** (reasoning alone is not a sufficient signal for effort support).
- 7 distinct variant ids observed across all providers: `none, low, medium, high, xhigh, max, minimal`.
- Variant sets are **per-model**, not per-provider. Real examples:
  - `openai/gpt-5.4` → `[none, low, medium, high, xhigh]`
  - `openai/gpt-5.5-pro` → `[medium, high, xhigh]` (no `none`, no `low`)
  - `openai/gpt-5.4-fast` / `gpt-5.4-mini*` → `[none, low, medium, high, xhigh]`
  - `deepseek/deepseek-v4-pro` / `deepseek-v4-flash` → `[low, medium, high, max]`
  - `deepseek/deepseek-reasoner` → `[]` (no variants)
  - `alibaba/qwq-plus` / `qvq-max` → `[low, medium, high]`
  - `deepinfra/openai/gpt-oss-120b` / `gpt-oss-20b` → `[low, medium, high]`
  - `fireworks-ai/accounts/fireworks/models/deepseek-v4-pro` → `[low, medium, high, max]`
- No model in this server's `config.providers` payload returned a `disabled: true` variant; defensive filtering is still added in the helper for SDK evolution.
- Variant value sample for `openai/gpt-5.4`: `{ reasoningEffort: "low", reasoningSummary: "auto", include: ["reasoning.encrypted_content"] }` — opaque, server-applied; GUI never reads it.

Wire-level smoke test (sanitized) — `POST /session/:id/message` with a JSON body containing `variant: "low"` was accepted by the running opencode 1.16.2 server without 4xx, confirming the field is part of the current request contract.

### 4. CLI confirmation (no secrets printed)

`opencode run --help` documents the user-facing flag and its meaning:

```
--variant  model variant (provider-specific reasoning effort, e.g., high, max, minimal)
```

The "e.g." wording corroborates the probe: the values are not a fixed set; the CLI examples are illustrative.

### 5. Current GUI surface

- `packages/core/src/domain.ts:305-308` — `ModelRef = { providerID; modelID }`. No effort/variant field.
- `packages/core/src/domain.ts:464-470` — `SendMessageOptions = { model?; files?; agent?; primaryAgent?; skill? }`. No effort field.
- `packages/core/src/domain.ts:394-421` — `ProviderInfo` / `ModelInfo` types do not declare `variants` (the runtime payload is currently cast through `mappers.ts:89-95` which uses `as unknown as`).
- `packages/core/src/protocol.ts:55-82` — `sendMessage`, `editAndResend`, `executeShell` carry only `model?: ModelRef`. No `effort` channel.
- `packages/platforms/vscode/webview/App.tsx:244-275, 282-313` — `handleSend` and `handleShellExecute` post `model: prov.selectedModel ?? undefined`. Nothing for effort.
- `packages/platforms/vscode/src/chat-view-provider.ts:100-109, 207-224` — extension host passes `message.model` straight into `agent.sendMessage` and `agent.executeShell`. No effort handling.
- `packages/agents/opencode/src/opencode-agent.ts:241-300` — `sendMessage` calls `client.session.promptAsync({ sessionID, parts, model, agent })`; `executeShell` calls `client.session.shell({ sessionID, agent, command, model })`. No `variant` is ever forwarded. This is the single point where the additive `variant` must be wired.

### 6. Recommended implementation contract (additive)

Replace the candidate `ModelRef.effort` sketch in Decision 3 with a sibling field, because the SDK request shape puts `variant` outside `model`:

```ts
// packages/core/src/domain.ts — additive
export type ModelVariantRef = {
  id: string;           // variant id (e.g., "low" | "medium" | "high" | provider-specific)
  disabled?: boolean;   // surfaces server-side disabled flag if present
};

export type ModelRef = {
  providerID: string;
  modelID: string;
  // intentionally no effort/variant field — see Decision 3 SHOULD note
};

export type ModelInfo = {
  id: string;
  name: string;
  // ... existing fields preserved ...
  variants?: Record<string, Record<string, unknown>>;  // NEW: opaque server-provided map
};

export type SendMessageOptions = {
  model?: ModelRef;
  effort?: ModelVariantRef;  // NEW: optional, omitted = opencode default behavior
  files?: FileAttachment[];
  agent?: string;
  primaryAgent?: string;
  skill?: string;
};
```

Protocol extension (additive; existing `{ providerID, modelID }` callers remain valid):

```ts
// packages/core/src/protocol.ts — additive
| {
    type: "sendMessage";
    sessionId: string;
    text: string;
    model?: ModelRef;
    effort?: ModelVariantRef;   // NEW
    files?: FileAttachment[];
    agent?: string;
    primaryAgent?: string;
    skill?: string;
  }
| {
    type: "editAndResend";
    sessionId: string;
    messageId: string;
    text: string;
    model?: ModelRef;
    effort?: ModelVariantRef;   // NEW
    files?: FileAttachment[];
  }
| {
    type: "executeShell";
    sessionId: string;
    command: string;
    model?: ModelRef;
    effort?: ModelVariantRef;   // NEW (forwarded on a best-effort basis; see below)
  }
```

Agent integration:

```ts
// packages/agents/opencode/src/opencode-agent.ts — additive
// - sendMessage / editAndResend → forward `variant: options.effort?.id` on promptAsync
// - executeShell → SDK 1.2.17 SessionShellData has no `variant` body field
//   Fallback: drop the effort for shell sends in this SDK version. Re-check
//   against newer SDK CHANGELOG; do not invent a request shape.
```

Normalized helper (tolerates metadata evolution):

```ts
// packages/core/src/model-effort.ts — new file
export function getModelVariants(model: ModelInfo): ModelVariantRef[] {
  const variants = (model.variants ?? {}) as Record<string, Record<string, unknown>>;
  return Object.entries(variants)
    .filter(([, v]) => !(v && typeof v === "object" && (v as { disabled?: unknown }).disabled === true))
    .map(([id]) => ({ id }));
}
```

Empty result means "no cycle support for this model"; the GUI must not invent defaults from the model id or provider id (probe shows 251 reasoning models without variants).

### 7. MUST compliance notes

- Default behavior: when `effort` is `undefined`, neither `sendMessage` nor `executeShell` writes a `variant` key, so the opencode server applies its own default (server log accepted all three of: variant=low, no variant, and unknown variant; only the explicit one is preserved server-side as intent).
- No hardcoded effort list: choices come from `getModelVariants(model)`. The `e.g., high, max, minimal` text in CLI help is not a contract.
- Additive contract: every protocol and agent signature preserves the existing `{ providerID, modelID }` shape; effort is an optional sibling.
- Evidence documented: SDK file paths and line numbers, live-server probe command, CLI help excerpt, and per-provider model examples are all recorded above.

### 8. Open blockers / follow-ups (deferred to Step 1.2+)

- `client.session.shell` does not accept `variant` in SDK 1.2.17. Mitigation: drop effort on shell send in this SDK version; revisit on SDK upgrade.
- No test fixtures yet for variant metadata; mock the `ProviderInfo` / `ModelInfo` shape with a synthetic `variants` map for unit tests.
- `ModelInfo` is currently cast through `as unknown as` (`mappers.ts:89-95`); add an explicit `variants` field to the domain type and update the cast accordingly.
- Whether the webview should expose a clickable effort dropdown in addition to `Ctrl+T` is a UX decision for Step 1.2+; current Step 1.1 only requires `Ctrl+T` cycle + compact display.
