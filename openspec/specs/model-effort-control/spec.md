# model-effort-control Specification

## Purpose
TBD - created by archiving change add-model-effort-toggle. Update Purpose after archive.
## Requirements
### Requirement: Preserve default effort until explicitly selected
The GUI SHALL preserve opencode's default model effort behavior when the user has not explicitly selected an effort in the GUI.

#### Scenario: Sending without explicit effort
- **WHEN** a user sends a chat message after selecting a model but before selecting or cycling effort
- **THEN** the GUI SHALL send the model without an explicit effort override
- **AND** opencode SHALL apply its server/config/default effort behavior

#### Scenario: Existing selected model state remains valid
- **WHEN** persisted UI state contains only a provider/model selection from a prior GUI version
- **THEN** the GUI SHALL load the selected model without requiring effort data
- **AND** the next prompt SHALL not include an explicit effort override until the user chooses one

### Requirement: Cycle valid effort choices with Ctrl+T
The GUI SHALL support cycling model effort from the message input with `Ctrl+T` when a selected model exposes valid effort choices.

#### Scenario: Cycling effort for a supported model
- **WHEN** focus is in the message input and the selected model has multiple valid effort choices
- **AND** the user presses `Ctrl+T`
- **THEN** the GUI SHALL prevent the browser/default key behavior for that event
- **AND** select the next valid effort in the model's effort order
- **AND** display the selected effort near the selected model

#### Scenario: Cycling from unset default
- **WHEN** the selected model has valid effort choices and the current GUI effort state is unset
- **AND** the user presses `Ctrl+T`
- **THEN** the GUI SHALL choose the first explicit effort in that model's valid effort order
- **AND** subsequent `Ctrl+T` presses SHALL continue cycling through the same valid effort order

#### Scenario: Unsupported model
- **WHEN** focus is in the message input and the selected model does not expose valid effort choices
- **AND** the user presses `Ctrl+T`
- **THEN** the GUI SHALL not send any effort override
- **AND** existing text input and send behavior SHALL remain unchanged

### Requirement: Validate effort when the selected model changes
The GUI SHALL validate the selected explicit effort against the currently selected model before displaying or sending it.

#### Scenario: New model supports the same effort
- **WHEN** the user has selected an explicit effort
- **AND** changes to another model that supports the same effort identifier
- **THEN** the GUI MAY keep that explicit effort selected
- **AND** the next prompt SHALL include that effort override

#### Scenario: New model does not support prior effort
- **WHEN** the user has selected an explicit effort
- **AND** changes to another model that does not support that effort identifier
- **THEN** the GUI SHALL clear the explicit effort selection
- **AND** the next prompt SHALL omit effort override unless the user chooses a valid effort for the new model

### Requirement: Send explicit effort through GUI protocol
The GUI SHALL propagate explicit effort selections through the webview-to-extension and agent send contracts for chat prompts and edit/resend prompts.

#### Scenario: Chat prompt with explicit effort
- **WHEN** a user sends a chat message with an explicit effort selected
- **THEN** the webview SHALL include that effort in the send message payload
- **AND** the extension host SHALL pass that effort to the opencode agent integration
- **AND** the opencode agent integration SHALL pass the effort to opencode using the verified API-compatible mechanism (top-level `variant` sibling of `model` on `client.session.promptAsync`)

#### Scenario: Edit and resend preserves explicit effort behavior
- **WHEN** a user edits and resends a message while an explicit effort is selected
- **THEN** the resend path SHALL preserve the same explicit effort behavior as normal message send

#### Scenario: Shell command with explicit effort selected
- **WHEN** a user executes a shell command while an explicit GUI effort is selected
- **THEN** the shell path SHALL preserve existing behavior
- **AND** SHALL not send an unsupported effort/variant to `client.session.shell(...)`
- **AND** SHALL not fail because effort is selected

### Requirement: Discover effort choices from provider metadata
The GUI SHALL derive valid effort choices from opencode/provider model metadata rather than hardcoding a single provider's effort list.

#### Scenario: Metadata exposes model variants
- **WHEN** provider model metadata exposes effort or variant choices
- **THEN** the GUI SHALL use those choices to populate the effort cycle for that model
- **AND** labels SHALL reflect the provider/model metadata where available

#### Scenario: Metadata does not expose choices
- **WHEN** provider model metadata does not expose effort or variant choices
- **THEN** the GUI SHALL treat effort as unsupported for that model
- **AND** SHALL not guess effort values from provider or model names

### Requirement: Keep existing model selector behavior
The model effort control SHALL not regress existing model selector behavior.

#### Scenario: Model search still filters models
- **WHEN** a user searches in the model selector
- **THEN** existing connected-provider filtering and no-results behavior SHALL continue to work

#### Scenario: Selecting a model still closes popover
- **WHEN** a user selects a model from the model selector
- **THEN** the GUI SHALL call the existing model select behavior
- **AND** close the popover as before

#### Scenario: Disconnected providers remain disabled
- **WHEN** disconnected providers are shown through existing show-all behavior
- **THEN** their model items SHALL remain disabled
- **AND** effort controls SHALL not make disconnected models selectable

