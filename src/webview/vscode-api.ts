/**
 * VSCode Webview API - backward-compatible re-export layer.
 *
 * This module re-exports the IBridge singleton from VscodeBridge and
 * domain/protocol types from @shared for backward compatibility.
 * New code should import directly from @shared for types and
 * use the bridge instance from ./bridges/VscodeBridge.
 */

// Re-export domain and protocol types from core
export type {
  AllProvidersData,
  FileAttachment,
  HostToUIMessage,
  ModelInfo,
  ProviderInfo,
  UIPersistedState,
  UIToHostMessage,
} from "@shared";

import type { HostToUIMessage, UIToHostMessage } from "@shared";

/** @deprecated Use HostToUIMessage instead */
export type ExtToWebviewMessage = HostToUIMessage;
/** @deprecated Use UIToHostMessage instead */
export type WebviewToExtMessage = UIToHostMessage;

// Re-export UIPersistedState as WebviewPersistedState for backward compatibility
import type { UIPersistedState } from "@shared";
/** @deprecated Use UIPersistedState from @shared instead */
export type WebviewPersistedState = UIPersistedState;

// Re-export bridge functions for backward compatibility
import { bridge } from "./bridges/VscodeBridge";

export function postMessage(message: UIToHostMessage): void {
  bridge.postMessage(message);
}

export function getPersistedState(): UIPersistedState | undefined {
  return bridge.getPersistedState() ?? undefined;
}

export function setPersistedState(state: UIPersistedState): void {
  bridge.setPersistedState(state);
}

// Export the bridge instance for code that wants to use IBridge directly
export { bridge };
