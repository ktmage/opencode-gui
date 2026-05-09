import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function createMockSdkClient() {
  return {
    event: {
      subscribe: vi.fn().mockResolvedValue({
        stream: (async function* () {
          // default empty stream
        })(),
      }),
    },
  };
}

let mockClient: ReturnType<typeof createMockSdkClient>;
const mockServerClose = vi.fn();

vi.mock("@opencode-ai/sdk/v2", () => ({
  createOpencodeServer: vi.fn().mockImplementation(() =>
    Promise.resolve({
      url: "http://localhost:12345",
      close: mockServerClose,
    }),
  ),
  createOpencodeClient: vi.fn().mockImplementation(() => mockClient),
}));

import { createOpencodeClient, createOpencodeServer } from "@opencode-ai/sdk/v2";
import { OpenCodeBinaryNotFoundError, OpenCodeClientNotConnectedError, OpenCodeError } from "../errors";
import { OpenCodeClientHandle } from "../opencode-client-handle";

describe("OpenCodeClientHandle", () => {
  let handle: OpenCodeClientHandle;

  beforeEach(() => {
    mockClient = createMockSdkClient();
    vi.mocked(createOpencodeClient).mockReturnValue(mockClient as never);
    handle = new OpenCodeClientHandle();
  });

  afterEach(() => {
    handle.disconnect();
    vi.clearAllMocks();
  });

  describe("connect()", () => {
    it("creates an OpenCode server on a free port and creates an SDK client", async () => {
      await handle.connect();

      expect(createOpencodeServer).toHaveBeenCalledWith({ port: 0 });
      expect(createOpencodeClient).toHaveBeenCalledWith({ baseUrl: "http://localhost:12345" });
      expect(handle.getClient()).toBe(mockClient);
      expect(handle.getServerUrl()).toBe("http://localhost:12345");
    });

    it("subscribes to SDK events after connecting", async () => {
      await handle.connect();

      expect(mockClient.event.subscribe).toHaveBeenCalled();
    });

    it("createOpencodeServer が ENOENT を投げた場合は OpenCodeBinaryNotFoundError に変換する", async () => {
      const enoent = Object.assign(new Error("spawn opencode ENOENT"), { code: "ENOENT" });
      vi.mocked(createOpencodeServer).mockRejectedValueOnce(enoent);

      await expect(handle.connect()).rejects.toBeInstanceOf(OpenCodeBinaryNotFoundError);
    });

    it("code が落ちていても message に ENOENT を含めば OpenCodeBinaryNotFoundError に変換する", async () => {
      // SDK 側でラップされて code フィールドが失われるケースを再現する。
      vi.mocked(createOpencodeServer).mockRejectedValueOnce(new Error("Failed to spawn: ENOENT"));

      await expect(handle.connect()).rejects.toBeInstanceOf(OpenCodeBinaryNotFoundError);
    });

    it("ENOENT 以外のエラーは OpenCodeError でラップされ、cause に元エラーを保持する", async () => {
      const original = new Error("port already in use");
      vi.mocked(createOpencodeServer).mockRejectedValueOnce(original);

      const rejection = await handle.connect().catch((e: unknown) => e);

      expect(rejection).toBeInstanceOf(OpenCodeError);
      // ラップ後はサブクラスではなく基底の OpenCodeError として投げられる。
      expect(rejection).not.toBeInstanceOf(OpenCodeBinaryNotFoundError);
      expect((rejection as OpenCodeError).cause).toBe(original);
    });

    it("OpenCodeBinaryNotFoundError も OpenCodeError として識別できる（基底クラスでまとめて catch 可能）", async () => {
      const enoent = Object.assign(new Error("spawn opencode ENOENT"), { code: "ENOENT" });
      vi.mocked(createOpencodeServer).mockRejectedValueOnce(enoent);

      await expect(handle.connect()).rejects.toBeInstanceOf(OpenCodeError);
    });
  });

  describe("disconnect()", () => {
    it("closes the server and clears client state", async () => {
      await handle.connect();

      handle.disconnect();

      expect(mockServerClose).toHaveBeenCalled();
      expect(handle.getServerUrl()).toBeUndefined();
      expect(() => handle.getClient()).toThrow(OpenCodeClientNotConnectedError);
      expect(() => handle.getClient()).toThrow(
        "OpenCode クライアントが接続されていません。先に connect() を呼び出してください。",
      );
    });

    it("is idempotent", () => {
      expect(() => handle.disconnect()).not.toThrow();
    });
  });

  describe("events", () => {
    it("delivers SSE events to listeners", async () => {
      const events = [
        { type: "session.updated", properties: { id: "sess-1" } },
        { type: "message.created", properties: { id: "msg-1" } },
      ];
      let resolveStream!: () => void;
      const streamDone = new Promise<void>((resolve) => {
        resolveStream = resolve;
      });

      mockClient.event.subscribe.mockResolvedValue({
        stream: (async function* () {
          for (const event of events) {
            yield event;
          }
          resolveStream();
        })(),
      });

      const listener = vi.fn();
      handle.onEvent(listener);
      await handle.connect();
      await streamDone;
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(listener).toHaveBeenCalledTimes(2);
      expect(listener).toHaveBeenCalledWith(events[0]);
      expect(listener).toHaveBeenCalledWith(events[1]);
    });

    it("removes listeners when their disposable is disposed", async () => {
      let emitEvent: ((event: unknown) => void) | undefined;
      let endStream: (() => void) | undefined;

      mockClient.event.subscribe.mockResolvedValue({
        stream: (async function* () {
          const queue: unknown[] = [];
          let resolve: (() => void) | undefined;
          let done = false;

          emitEvent = (event: unknown) => {
            queue.push(event);
            resolve?.();
          };
          endStream = () => {
            done = true;
            resolve?.();
          };

          while (!done) {
            if (queue.length > 0) {
              const next = queue.shift();
              if (next !== undefined) {
                yield next;
              }
            } else {
              await new Promise<void>((r) => {
                resolve = r;
              });
            }
          }
        })(),
      });

      await handle.connect();
      const listener = vi.fn();
      const disposable = handle.onEvent(listener);

      emitEvent?.({ type: "test-event-1" });
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(listener).toHaveBeenCalledTimes(1);

      disposable.dispose();
      emitEvent?.({ type: "test-event-2" });
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(listener).toHaveBeenCalledTimes(1);

      endStream?.();
    });

    it("resubscribes by aborting the previous stream and creating a new subscription", async () => {
      await handle.connect();

      expect(mockClient.event.subscribe).toHaveBeenCalledTimes(1);

      await handle.resubscribeEvents();

      expect(mockClient.event.subscribe).toHaveBeenCalledTimes(2);
    });
  });
});
