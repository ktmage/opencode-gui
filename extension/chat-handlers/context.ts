import type { OpencodeClient } from "@opencode-ai/sdk/v2";
import type { ChatSession, HostToUIMessage, UIToHostMessage } from "@shared";
import type { DifitHandle } from "../difit-handle";
import type { OpenCodeClientHandle } from "../opencode-client-handle";

/**
 * 個別のメッセージハンドラーが共通で使うコンテキスト。
 * `ChatPanel.handleWebviewMessageInner` がリクエストごとに組み立てて渡す。
 */
export interface ChatHandlerContext {
  /** 接続済みの OpenCode SDK クライアント。 */
  readonly client: OpencodeClient;
  /** OpenCode サーバーの URL 取得など、クライアント以外の用途用。 */
  readonly openCodeClientHandle: OpenCodeClientHandle;
  readonly difitHandle: DifitHandle;
  /** path 解決などで使うワークスペースフォルダの絶対パス。 */
  readonly workspaceFolder: string;
  /** Webview にメッセージを送信する。 */
  postMessage(message: HostToUIMessage): void;
  /** UI 側で持つ「現在アクティブなセッション」状態の取得。 */
  getActiveSession(): ChatSession | null;
  /** UI 側で持つ「現在アクティブなセッション」状態の更新。 */
  setActiveSession(session: ChatSession | null): void;
}

/** `UIToHostMessage` の中から特定 `type` のメッセージだけを取り出すユーティリティ型。 */
export type Msg<T extends UIToHostMessage["type"]> = Extract<UIToHostMessage, { type: T }>;
