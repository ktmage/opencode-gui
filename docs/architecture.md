# Architecture

OpenCodeGUI is a single VS Code extension package. The extension host starts an
OpenCode server through `@opencode-ai/sdk`, forwards SDK events to the webview,
and handles VS Code-specific operations such as opening files, terminals, and
diff editors.

## Structure

```
src/
  extension.ts              VS Code activation entry point
  chat-view-provider.ts     Webview message router
  opencode-agent.ts         OpenCode SDK lifecycle and API calls
  mappers.ts                SDK type to UI/domain type mapping
  vscode-platform-services.ts
                             VS Code API helpers
  shared/
    domain.ts               Shared session/message/tool/config types
    protocol.ts             Webview <-> extension host messages
  webview/
  App.tsx                   React state and event handling
  components/               UI components
  hooks/                    React hooks
  contexts/                 React contexts
  locales/                  Localization dictionaries
  utils/                    UI utilities
  __tests__/                Webview tests
```

## Data Flow

1. `extension.ts` creates `OpenCodeAgent` and calls `connect()`.
2. `OpenCodeAgent` starts the OpenCode server, creates the SDK client, and
   subscribes to SDK events.
3. `ChatViewProvider` receives messages from the webview and calls
   `OpenCodeAgent` or `VscodePlatformServices` directly.
4. SDK events are mapped in `mappers.ts` and forwarded to the webview as
   `HostToUIMessage`.
5. The webview updates React state from host messages and sends user actions
   back as `UIToHostMessage`.

## Build And Test

- Extension host bundle: `npm run build:ext`
- Webview bundle: `npm run build:webview`
- Full build: `npm run build`
- Webview tests: `npm test`
- Extension host tests: `npm run test:ext`
- All tests: `npm run test:all`
