import { createOpencodeClient, createOpencodeServer, type OpencodeClient } from "@opencode-ai/sdk/v2";
import type { AgentEvent, Disposable } from "@shared";
import { OpenCodeBinaryNotFoundError, OpenCodeClientNotConnectedError, OpenCodeServerStartError } from "./errors";

/** OpenCode から受信したエージェントイベントを処理するコールバック。 */
type EventHandler = (event: AgentEvent) => void;

/** spawn 失敗が ENOENT（実行ファイル未検出）を示しているか判定する。 */
function isBinaryNotFoundError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  // Node 標準の NodeJS.ErrnoException は code フィールドを持つ。
  // SDK 側でラップされて code が落ちているケースに備えて message も見る。
  const code = (error as NodeJS.ErrnoException).code;
  return code === "ENOENT" || error.message.includes("ENOENT");
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

  /**
   * OpenCode サーバーを起動し、SDK クライアントとイベント購読を初期化する。
   *
   * @throws {@link OpenCodeBinaryNotFoundError} `opencode` バイナリが PATH 上に存在しない場合。
   * @throws {@link OpenCodeServerStartError} それ以外の理由でサーバー起動に失敗した場合。
   */
  async connect(): Promise<void> {
    let server: { url: string; close(): void };
    try {
      server = await createOpencodeServer({ port: 0 });
    } catch (error) {
      if (isBinaryNotFoundError(error)) {
        throw new OpenCodeBinaryNotFoundError(error);
      }
      throw new OpenCodeServerStartError(error);
    }
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
