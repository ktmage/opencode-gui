import type { ChatSession, HostToUIMessage, UIToHostMessage } from "@shared";
import * as vscode from "vscode";
import type { ChatHandlerContext } from "./chat-handlers/context";
import * as init from "./chat-handlers/init";
import * as messaging from "./chat-handlers/messaging";
import * as meta from "./chat-handlers/meta";
import * as session from "./chat-handlers/session";
import { getActiveEditorFile } from "./chat-handlers/utils";
import * as vscodeActions from "./chat-handlers/vscode-actions";
import type { DifitHandle } from "./difit-handle";
import type { OpenCodeClientHandle } from "./opencode-client-handle";

/**
 * OpenCode のチャット UI を表示するサイドバーパネル。
 * Webview のライフサイクル管理と、UI から受信したメッセージを各ハンドラーへ振り分ける役割を持つ。
 * 個々の処理は `chat-handlers/` 配下のモジュールに分離されている。
 */
export class ChatPanel implements vscode.WebviewViewProvider {
  public static readonly viewType = "opencode.chatView";

  private view: vscode.WebviewView | undefined;
  // OpenCode サーバーには「現在アクティブなセッション」を保持する API がないため、
  // UI クライアント側で管理する（TUI も同様の設計）。
  private activeSession: ChatSession | null = null;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly openCodeClientHandle: OpenCodeClientHandle,
    private readonly workspaceFolder: string,
    private readonly difitHandle: DifitHandle,
  ) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, "dist", "webview")],
    };

    webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage((message: UIToHostMessage) => this.handleWebviewMessage(message));

    // SSE イベントを Webview に転送する
    this.openCodeClientHandle.onEvent((event) => {
      this.postMessage({ type: "event", event });
    });

    // アクティブエディタが変わるたびに Webview に通知する
    // (プッシュ型通知はメッセージルーターの責務として残す)
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      this.postMessage({ type: "activeEditor", file: getActiveEditorFile(editor) });
    });
  }

  private async handleWebviewMessage(message: UIToHostMessage): Promise<void> {
    try {
      await this.dispatch(message);
    } catch (err) {
      console.error(`[OpenCode] Error handling message '${message.type}':`, err);
    }
  }

  private async dispatch(message: UIToHostMessage): Promise<void> {
    const ctx: ChatHandlerContext = {
      client: this.openCodeClientHandle.getClient(),
      openCodeClientHandle: this.openCodeClientHandle,
      difitHandle: this.difitHandle,
      workspaceFolder: this.workspaceFolder,
      postMessage: (msg) => this.postMessage(msg),
      getActiveSession: () => this.activeSession,
      setActiveSession: (s) => {
        this.activeSession = s;
      },
    };

    switch (message.type) {
      // --- 初期化 ---
      case "ready":
        return init.ready(ctx);

      // --- session 操作 ---
      case "createSession":
        return session.createSession(ctx, message);
      case "listSessions":
        return session.listSessions(ctx);
      case "selectSession":
        return session.selectSession(ctx, message);
      case "deleteSession":
        return session.deleteSession(ctx, message);
      case "getMessages":
        return session.getMessages(ctx, message);
      case "compressSession":
        return session.compressSession(ctx, message);
      case "revertToMessage":
        return session.revertToMessage(ctx, message);
      case "forkSession":
        return session.forkSession(ctx, message);
      case "getSessionDiff":
        return session.getSessionDiff(ctx, message);
      case "getSessionTodos":
        return session.getSessionTodos(ctx, message);
      case "getChildSessions":
        return session.getChildSessions(ctx, message);
      case "shareSession":
        return session.shareSession(ctx, message);
      case "unshareSession":
        return session.unshareSession(ctx, message);
      case "undoSession":
        return session.undoSession(ctx, message);
      case "redoSession":
        return session.redoSession(ctx, message);

      // --- メッセージ送信・割り込み ---
      case "sendMessage":
        return messaging.sendMessage(ctx, message);
      case "editAndResend":
        return messaging.editAndResend(ctx, message);
      case "executeShell":
        return messaging.executeShell(ctx, message);
      case "abort":
        return messaging.abort(ctx, message);
      case "replyPermission":
        return messaging.replyPermission(ctx, message);
      case "replyQuestion":
        return messaging.replyQuestion(ctx, message);
      case "rejectQuestion":
        return messaging.rejectQuestion(ctx, message);

      // --- 設定・メタ情報 ---
      case "getProviders":
        return meta.getProviders(ctx);
      case "getAgents":
        return meta.getAgents(ctx);
      case "getSkills":
        return meta.getSkills(ctx);
      case "setModel":
        return meta.setModel(ctx, message);
      case "openConfigFile":
        return meta.openConfigFile(ctx, message);

      // --- VS Code 操作 ---
      case "getOpenEditors":
        return vscodeActions.getOpenEditors(ctx);
      case "searchWorkspaceFiles":
        return vscodeActions.searchWorkspaceFiles(ctx, message);
      case "openTerminal":
        return vscodeActions.openTerminal(ctx);
      case "openDiffEditor":
        return vscodeActions.openDiffEditor(ctx, message);
      case "openFile":
        return vscodeActions.openFile(ctx, message);
      case "copyToClipboard":
        return vscodeActions.copyToClipboard(ctx, message);
      case "openDiffReview":
        return vscodeActions.openDiffReview(ctx, message);
      case "stopDiffReview":
        return vscodeActions.stopDiffReview(ctx);
    }
  }

  private postMessage(message: HostToUIMessage): void {
    this.view?.webview.postMessage(message);
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    const distUri = vscode.Uri.joinPath(this.extensionUri, "dist", "webview");

    // Vite がビルドした JS/CSS アセットを参照する
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(distUri, "assets", "index.js"));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(distUri, "assets", "index.css"));

    const nonce = getNonce();

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src ${webview.cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}';" />
  <link rel="stylesheet" href="${styleUri}" nonce="${nonce}" />
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}
