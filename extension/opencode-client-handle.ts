import { createOpencodeClient, createOpencodeServer, type OpencodeClient } from "@opencode-ai/sdk/v2";
import type { AgentEvent, Disposable } from "@shared";

/** OpenCode から受信したエージェントイベントを処理するコールバック。 */
type EventHandler = (event: AgentEvent) => void;

/** OpenCode クライアントが未接続の状態で要求された場合のエラー。 */
export class OpenCodeClientNotConnectedError extends Error {
  /** エラー名とメッセージを初期化する。 */
  constructor() {
    super("OpenCode クライアントが接続されていません。先に connect() を呼び出してください。");
    this.name = "OpenCodeClientNotConnectedError";
  }
}

/**
 * OpenCode サーバーと SDK クライアントのライフサイクルを管理する。
 * VS Code 拡張側からクライアント取得と SSE イベント購読を提供する。
 */
export class OpenCodeClientHandle {
  private client: OpencodeClient | undefined;
  private server: { url: string; close(): void } | undefined;
  private sseAbortController: AbortController | undefined;
  private listeners: Set<EventHandler> = new Set();

  /** OpenCode サーバーを起動し、SDK クライアントとイベント購読を初期化する。 */
  async connect(): Promise<void> {
    const server = await createOpencodeServer({ port: 0 });
    this.server = server;
    this.client = createOpencodeClient({ baseUrl: server.url });
    this.subscribeToEvents();
  }

  /** イベント購読を停止し、サーバーとクライアントを破棄する。 */
  disconnect(): void {
    this.sseAbortController?.abort();
    this.sseAbortController = undefined;
    this.server?.close();
    this.server = undefined;
    this.client = undefined;
    this.listeners.clear();
  }

  /**
   * 接続済みの OpenCode SDK クライアントを返す。
   *
   * @throws {@link OpenCodeClientNotConnectedError} OpenCode クライアントが未接続の場合。
   */
  getClient(): OpencodeClient {
    if (!this.client) {
      throw new OpenCodeClientNotConnectedError();
    }
    return this.client;
  }

  /** 起動中の OpenCode サーバー URL を返す。未接続の場合は undefined を返す。 */
  getServerUrl(): string | undefined {
    return this.server?.url;
  }

  /**
   * OpenCode のエージェントイベントを購読する。
   *
   * @param handler 受信イベントを処理するコールバック。
   * @returns 購読解除に使う Disposable。
   */
  onEvent(handler: EventHandler): Disposable {
    this.listeners.add(handler);
    return {
      dispose: () => {
        this.listeners.delete(handler);
      },
    };
  }

  /** 現在の SSE 購読を張り直す。 */
  async resubscribeEvents(): Promise<void> {
    await this.subscribeToEvents();
  }

  /** 既存の SSE 購読を停止してから、新しいイベントストリームを購読する。 */
  private async subscribeToEvents(): Promise<void> {
    const client = this.getClient();
    this.sseAbortController?.abort();
    this.sseAbortController = new AbortController();
    const result = await client.event.subscribe(undefined, {
      signal: this.sseAbortController.signal,
    });

    (async () => {
      try {
        for await (const event of result.stream) {
          for (const listener of this.listeners) {
            listener(event as unknown as AgentEvent);
          }
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        throw error;
      }
    })();
  }
}
