import { createOpencodeClient, createOpencodeServer, type OpencodeClient } from "@opencode-ai/sdk/v2";
import type { AgentEvent, Disposable } from "@shared";

type EventHandler = (event: AgentEvent) => void;

export class OpenCodeClientHandle {
  private client: OpencodeClient | undefined;
  private server: { url: string; close(): void } | undefined;
  private sseAbortController: AbortController | undefined;
  private listeners: Set<EventHandler> = new Set();

  async connect(): Promise<void> {
    const server = await createOpencodeServer({ port: 0 });
    this.server = server;
    this.client = createOpencodeClient({ baseUrl: server.url });
    this.subscribeToEvents();
  }

  disconnect(): void {
    this.sseAbortController?.abort();
    this.sseAbortController = undefined;
    this.server?.close();
    this.server = undefined;
    this.client = undefined;
    this.listeners.clear();
  }

  getClient(): OpencodeClient {
    if (!this.client) {
      throw new Error("OpenCode client is not connected. Call connect() first.");
    }
    return this.client;
  }

  getServerUrl(): string | undefined {
    return this.server?.url;
  }

  onEvent(handler: EventHandler): Disposable {
    this.listeners.add(handler);
    return {
      dispose: () => {
        this.listeners.delete(handler);
      },
    };
  }

  async resubscribeEvents(): Promise<void> {
    await this.subscribeToEvents();
  }

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
