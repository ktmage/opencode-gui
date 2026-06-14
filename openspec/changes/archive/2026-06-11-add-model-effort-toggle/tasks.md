## 1. Discovery And Contract Shape

- [X] 1.1 Inspect opencode provider metadata and SDK prompt request shape for effort/variant support; record findings in `design.md` Open Questions or a short implementation note; verify by running a focused script or test-safe logging command that does not expose secrets.
- [X] 1.2 Add core type support for optional explicit model effort/variant without changing default model payload semantics; verify with `pnpm --filter @opencodegui/core test` or the nearest available TypeScript/test command.
- [X] 1.3 Add normalized effort-choice helper(s) that derive valid efforts only from verified provider/model metadata; verify with unit tests for supported metadata, unsupported metadata, unset default, and model-change invalidation cases.

## 2. Webview State And UI

- [X] 2.1 Extend provider/model state so the GUI can track an optional explicit effort for the selected model and clear it when invalid for the newly selected model; verify with hook/component tests.
- [X] 2.2 Display explicit effort compactly next to the selected model label while showing no effort text when the state is unset; verify model selector tests still pass.
- [X] 2.3 Add `Ctrl+T` handling in the message input to cycle valid efforts only when supported; verify shortcut behavior with React Testing Library and ensure Enter, IME, popup navigation, and input history tests still pass.

## 3. Protocol And Agent Forwarding

- [X] 3.1 Extend webview-to-extension protocol messages for `sendMessage` and `editAndResend` to carry explicit effort only when selected; verify existing payload tests assert effort is omitted by default. `executeShell` is intentionally not extended in this change because the current `client.session.shell(...)` SDK shape does not support `variant`.
- [X] 3.2 Forward explicit effort through `chat-view-provider` into `IAgent` options for the chat and edit/resend prompt paths without altering calls where effort is absent; verify extension-host tests for send and edit/resend paths.
- [X] 3.3 Map explicit effort into the verified opencode `promptAsync` request shape in `opencode-agent` (top-level `variant: effort.id` sibling of `model`); verify opencode-agent tests cover default omission and explicit effort forwarding.
- [X] 3.4 Verify shell compatibility: `executeShell` continues to use only `{ providerID, modelID }`, does not include `variant`, and does not fail when an explicit effort is selected in the GUI.

## 4. End-To-End Verification

- [X] 4.1 Add or update scenario tests for default unset effort, `Ctrl+T` cycling, model-change invalidation, visible effort label, and no hardcoded effort for unsupported models; verify focused webview tests pass.
- [X] 4.2 Run repository verification for affected packages: focused tests, TypeScript/build command if available, and `pnpm test -- 06-model-selection` or closest convention; record any pre-existing unrelated failures.
- [X] 4.3 Build, package, and install the VSIX for manual verification; verify in VS Code that `Ctrl+T` cycles effort in the webview textarea, selected effort is visible, and prompts without explicit effort retain default behavior.
