import * as fs from "node:fs/promises";
import * as path from "node:path";
import type {
  AgentInfo,
  AllProvidersData,
  AppPaths,
  ChatMessageWithParts,
  ChatSession,
  FileAttachment,
  FileDiff,
  HostToUIMessage,
  ProviderInfo,
  SendMessageOptions,
  SkillInfo,
  TodoItem,
  UIToHostMessage,
} from "@shared";
import * as vscode from "vscode";
import type { DiffReviewManager } from "./diff-review-manager";
import type { OpenCodeClientHandle } from "./opencode-client-handle";

export class ChatViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "opencode.chatView";

  private view: vscode.WebviewView | undefined;
  // OpenCode サーバーには「現在アクティブなセッション」を保持する API がないため、
  // UI クライアント側で管理する（TUI も同様の設計）。
  private activeSession: ChatSession | null = null;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly openCodeClientHandle: OpenCodeClientHandle,
    private readonly workspaceFolder: string,
    private readonly diffReviewManager: DiffReviewManager,
    private readonly difitAvailable: boolean,
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
      this.postMessage({ type: "activeEditor", file: this.getActiveEditorFile(editor) });
    });
  }

  private async handleWebviewMessage(message: UIToHostMessage): Promise<void> {
    try {
      await this.handleWebviewMessageInner(message);
    } catch (err) {
      console.error(`[OpenCode] Error handling message '${message.type}':`, err);
    }
  }

  private async handleWebviewMessageInner(message: UIToHostMessage): Promise<void> {
    const client = this.openCodeClientHandle.getClient();

    switch (message.type) {
      case "ready": {
        // Webview の初期化完了時に init メッセージを送信する（locale + toolConfig を統合）
        const paths = (await client.path.get()).data! as unknown as AppPaths;
        this.postMessage({
          type: "init",
          locale: vscode.env.language,
          paths,
        });
        // セッション一覧、現在のセッション、プロバイダー一覧を送信する
        const sessions = (await client.session.list()).data! as unknown as ChatSession[];
        this.postMessage({ type: "sessions", sessions });
        this.postMessage({ type: "activeSession", session: this.activeSession });
        const [providersResponse, allProvidersResponse] = await Promise.all([
          client.config.providers(),
          client.provider.list(),
        ]);
        const providersData = providersResponse.data!;
        const allProviders = allProvidersResponse.data! as unknown as AllProvidersData;
        // config ファイルから model を直接読み取る（config.get API は model を正しく返さない）
        let configModel: string | undefined;
        try {
          const raw = await fs.readFile(path.join(paths.config, "opencode.json"), "utf-8");
          const configJson = JSON.parse(raw);
          configModel = configJson.model;
        } catch {
          // ファイルが存在しない場合は undefined のまま
        }
        this.postMessage({
          type: "providers",
          providers: providersData.providers as unknown as ProviderInfo[],
          allProviders,
          default: providersData.default,
          configModel,
        });
        // 初期アクティブエディタを送信する
        this.postMessage({ type: "activeEditor", file: this.getActiveEditorFile(vscode.window.activeTextEditor) });
        // difit の利用可否を Webview に通知する
        this.postMessage({ type: "difitAvailable", available: this.difitAvailable });
        break;
      }
      case "sendMessage": {
        await client.session.promptAsync({
          sessionID: message.sessionId,
          parts: this.toPromptParts(message.text, {
            model: message.model,
            files: message.files,
            agent: message.agent,
            primaryAgent: message.primaryAgent,
            skill: message.skill,
          }),
          model: message.model,
          agent: message.primaryAgent,
        });
        break;
      }
      case "createSession": {
        const session = (await client.session.create({ title: message.title })).data! as unknown as ChatSession;
        this.activeSession = session;
        this.postMessage({ type: "activeSession", session });
        const sessions = (await client.session.list()).data! as unknown as ChatSession[];
        this.postMessage({ type: "sessions", sessions });
        break;
      }
      case "listSessions": {
        const sessions = (await client.session.list()).data! as unknown as ChatSession[];
        this.postMessage({ type: "sessions", sessions });
        break;
      }
      case "selectSession": {
        const session = (await client.session.get({ sessionID: message.sessionId })).data! as unknown as ChatSession;
        this.activeSession = session;
        this.postMessage({ type: "activeSession", session });
        const messages = (await client.session.messages({ sessionID: message.sessionId }))
          .data! as unknown as ChatMessageWithParts[];
        this.postMessage({ type: "messages", sessionId: message.sessionId, messages });
        break;
      }
      case "deleteSession": {
        await client.session.delete({ sessionID: message.sessionId });
        if (this.activeSession?.id === message.sessionId) {
          this.activeSession = null;
          this.postMessage({ type: "activeSession", session: null });
        }
        const sessions = (await client.session.list()).data! as unknown as ChatSession[];
        this.postMessage({ type: "sessions", sessions });
        break;
      }
      case "getMessages": {
        const messages = (await client.session.messages({ sessionID: message.sessionId }))
          .data! as unknown as ChatMessageWithParts[];
        this.postMessage({ type: "messages", sessionId: message.sessionId, messages });
        break;
      }
      case "replyPermission": {
        await client.permission.reply({ requestID: message.permissionId, reply: message.response });
        break;
      }
      case "replyQuestion": {
        await client.question.reply({ requestID: message.requestId, answers: message.answers });
        break;
      }
      case "rejectQuestion": {
        await client.question.reject({ requestID: message.requestId });
        break;
      }
      case "abort": {
        await client.session.abort({ sessionID: message.sessionId });
        break;
      }
      case "getProviders": {
        const [providersResponse, allProvidersResponse, pathsResponse] = await Promise.all([
          client.config.providers(),
          client.provider.list(),
          client.path.get(),
        ]);
        const providersData = providersResponse.data!;
        const allProviders = allProvidersResponse.data! as unknown as AllProvidersData;
        const paths = pathsResponse.data! as unknown as AppPaths;
        let configModel: string | undefined;
        try {
          const raw = await fs.readFile(path.join(paths.config, "opencode.json"), "utf-8");
          configModel = JSON.parse(raw).model;
        } catch {
          // ignore
        }
        this.postMessage({
          type: "providers",
          providers: providersData.providers as unknown as ProviderInfo[],
          allProviders,
          default: providersData.default,
          configModel,
        });
        break;
      }
      // --- Platform operations ---
      case "getOpenEditors": {
        const files = await this.getOpenEditors();
        this.postMessage({ type: "openEditors", files });
        break;
      }
      case "searchWorkspaceFiles": {
        const files = await this.searchWorkspaceFiles(message.query);
        this.postMessage({ type: "workspaceFiles", files });
        break;
      }
      case "compressSession": {
        await client.session.summarize({
          sessionID: message.sessionId,
          providerID: message.model?.providerID,
          modelID: message.model?.modelID,
        });
        break;
      }
      case "revertToMessage": {
        const session = (await client.session.revert({ sessionID: message.sessionId, messageID: message.messageId }))
          .data! as unknown as ChatSession;
        this.activeSession = session;
        this.postMessage({ type: "activeSession", session });
        const messages = (await client.session.messages({ sessionID: message.sessionId }))
          .data! as unknown as ChatMessageWithParts[];
        this.postMessage({ type: "messages", sessionId: message.sessionId, messages });
        break;
      }
      case "editAndResend": {
        // 1. 指定メッセージまで巻き戻す（そのメッセージ以降を削除）
        const session = (await client.session.revert({ sessionID: message.sessionId, messageID: message.messageId }))
          .data! as unknown as ChatSession;
        this.activeSession = session;
        this.postMessage({ type: "activeSession", session });
        const msgs = (await client.session.messages({ sessionID: message.sessionId }))
          .data! as unknown as ChatMessageWithParts[];
        this.postMessage({ type: "messages", sessionId: message.sessionId, messages: msgs });
        // 2. 編集後のテキストを送信
        await client.session.promptAsync({
          sessionID: message.sessionId,
          parts: this.toPromptParts(message.text, {
            model: message.model,
            files: message.files,
          }),
          model: message.model,
          agent: undefined,
        });
        break;
      }
      case "executeShell": {
        await client.session.shell({
          sessionID: message.sessionId,
          agent: "default",
          command: message.command,
          model: message.model,
        });
        break;
      }
      case "openConfigFile": {
        await this.openConfigFile(message.filePath);
        break;
      }
      case "openTerminal": {
        const serverUrl = this.openCodeClientHandle.getServerUrl();
        if (!serverUrl) break;
        await this.openTerminal(serverUrl, this.activeSession?.id);
        break;
      }
      case "setModel": {
        await this.setConfiguredModel(message.model);
        this.postMessage({ type: "modelUpdated", model: message.model, default: {} });
        break;
      }
      case "forkSession": {
        // Fork で新しいセッションを作成し、アクティブセッションを切り替える
        const forkedSession = (await client.session.fork({
          sessionID: message.sessionId,
          messageID: message.messageId,
        })).data! as unknown as ChatSession;
        this.activeSession = forkedSession;
        this.postMessage({ type: "activeSession", session: forkedSession });
        const forkedSessions = (await client.session.list()).data! as unknown as ChatSession[];
        this.postMessage({ type: "sessions", sessions: forkedSessions });
        break;
      }
      case "getSessionDiff": {
        const diffs = (await client.session.diff({ sessionID: message.sessionId })).data! as unknown as FileDiff[];
        this.postMessage({ type: "sessionDiff", sessionId: message.sessionId, diffs });
        break;
      }
      case "getSessionTodos": {
        const todos = (await client.session.todo({ sessionID: message.sessionId })).data! as unknown as TodoItem[];
        this.postMessage({ type: "sessionTodos", sessionId: message.sessionId, todos });
        break;
      }
      case "getChildSessions": {
        const children = (await client.session.children({ sessionID: message.sessionId }))
          .data! as unknown as ChatSession[];
        this.postMessage({ type: "childSessions", sessionId: message.sessionId, children });
        break;
      }
      case "getAgents": {
        const agents = (await client.app.agents()).data! as unknown as AgentInfo[];
        this.postMessage({ type: "agents", agents });
        break;
      }
      case "getSkills": {
        const skills = (await client.app.skills()).data! as unknown as SkillInfo[];
        this.postMessage({ type: "skills", skills });
        break;
      }
      case "shareSession": {
        const session = (await client.session.share({ sessionID: message.sessionId })).data! as unknown as ChatSession;
        this.activeSession = session;
        this.postMessage({ type: "activeSession", session });
        // 共有 URL をクリップボードにコピーする
        if (session.share?.url) {
          await this.copyToClipboard(session.share.url);
        }
        break;
      }
      case "unshareSession": {
        const session = (await client.session.unshare({ sessionID: message.sessionId }))
          .data! as unknown as ChatSession;
        this.activeSession = session;
        this.postMessage({ type: "activeSession", session });
        break;
      }
      case "copyToClipboard": {
        await this.copyToClipboard(message.text);
        break;
      }
      case "undoSession": {
        const session = (await client.session.revert({ sessionID: message.sessionId, messageID: message.messageId }))
          .data! as unknown as ChatSession;
        this.activeSession = session;
        this.postMessage({ type: "activeSession", session });
        const messages = (await client.session.messages({ sessionID: message.sessionId }))
          .data! as unknown as ChatMessageWithParts[];
        this.postMessage({ type: "messages", sessionId: message.sessionId, messages });
        break;
      }
      case "redoSession": {
        const session = (await client.session.unrevert({ sessionID: message.sessionId })).data! as unknown as ChatSession;
        this.activeSession = session;
        this.postMessage({ type: "activeSession", session });
        const messages = (await client.session.messages({ sessionID: message.sessionId }))
          .data! as unknown as ChatMessageWithParts[];
        this.postMessage({ type: "messages", sessionId: message.sessionId, messages });
        break;
      }
      case "openDiffEditor": {
        await this.openDiffEditor(message.filePath, message.before, message.after);
        break;
      }
      case "openFile": {
        await this.openFile(message.filePath, message.line);
        break;
      }
      case "openDiffReview": {
        if (!this.activeSession) {
          break;
        }
        try {
          const diffs = (await client.session.diff({ sessionID: this.activeSession.id })).data! as unknown as FileDiff[];
          if (diffs.length === 0) {
            break;
          }
          await this.diffReviewManager.start(diffs, message.focusFile);
          this.postMessage({ type: "diffReviewStarted" });
        } catch (e) {
          const errorMsg = e instanceof Error ? e.message : String(e);
          console.error("[openDiffReview]", errorMsg);
          this.postMessage({ type: "diffReviewError", error: errorMsg });
        }
        break;
      }
      case "stopDiffReview": {
        this.diffReviewManager.stop();
        this.postMessage({ type: "diffReviewStopped" });
        break;
      }
    }
  }

  private toPromptParts(
    text: string,
    options?: SendMessageOptions,
  ): Array<
    | { type: "text"; text: string; synthetic?: boolean }
    | { type: "file"; mime: string; url: string; filename: string }
    | { type: "agent"; name: string }
  > {
    const parts: Array<
      | { type: "text"; text: string; synthetic?: boolean }
      | { type: "file"; mime: string; url: string; filename: string }
      | { type: "agent"; name: string }
    > = [];

    if (options?.skill) {
      parts.push({ type: "text", text: `/${options.skill}`, synthetic: true });
    }

    parts.push({ type: "text", text });

    if (options?.files) {
      for (const file of options.files) {
        const absPath = path.isAbsolute(file.filePath)
          ? file.filePath
          : path.resolve(this.workspaceFolder, file.filePath);
        parts.push({
          type: "file",
          mime: "text/plain",
          url: `file://${absPath}`,
          filename: file.fileName,
        });
      }
    }

    if (options?.agent) {
      parts.push({ type: "agent", name: options.agent });
    }

    return parts;
  }

  private async setConfiguredModel(model: string): Promise<void> {
    const client = this.openCodeClientHandle.getClient();
    const paths = (await client.path.get()).data! as unknown as AppPaths;
    const configFilePath = path.join(paths.config, "opencode.json");
    let configJson: Record<string, unknown> = {};
    try {
      const raw = await fs.readFile(configFilePath, "utf-8");
      configJson = JSON.parse(raw);
    } catch {
      // File may not exist yet.
    }
    configJson.model = model;
    await fs.mkdir(path.dirname(configFilePath), { recursive: true });
    await fs.writeFile(configFilePath, `${JSON.stringify(configJson, null, 2)}\n`);
  }

  /** アクティブなテキストエディタから FileAttachment を生成する。エディタがない場合は null を返す。 */
  private getActiveEditorFile(editor: vscode.TextEditor | undefined): FileAttachment | null {
    if (!editor) return null;
    const uri = editor.document.uri;
    // 出力パネルや設定画面など、file スキーム以外は対象外
    if (uri.scheme !== "file") return null;
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri;
    const relativePath = workspaceFolder
      ? path.relative(workspaceFolder.fsPath, uri.fsPath)
      : path.basename(uri.fsPath);
    return { filePath: relativePath, fileName: path.basename(uri.fsPath) };
  }

  // --- VS Code API 呼び出し（webview 依頼の処理用） ---

  /** 仮想ドキュメントを使って VS Code のネイティブ diff エディタを開く。 */
  private async openDiffEditor(filePath: string, before: string, after: string): Promise<void> {
    const beforeUri = vscode.Uri.parse(`opencode-diff-before:${filePath}?${encodeURIComponent(before)}`);
    const afterUri = vscode.Uri.parse(`opencode-diff-after:${filePath}?${encodeURIComponent(after)}`);
    const fileName = path.basename(filePath);
    await vscode.commands.executeCommand("vscode.diff", beforeUri, afterUri, `${fileName} (Changes)`);
  }

  private async copyToClipboard(text: string): Promise<void> {
    await vscode.env.clipboard.writeText(text);
  }

  private async openTerminal(serverUrl: string, sessionId?: string): Promise<void> {
    const args = ["attach", serverUrl];
    if (sessionId) {
      args.push("--session", sessionId);
    }
    const wsFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const terminal = vscode.window.createTerminal({
      name: "OpenCode",
      cwd: wsFolder,
    });
    terminal.show();
    terminal.sendText(`opencode ${args.map((a) => JSON.stringify(a)).join(" ")}`);
  }

  /** 設定ファイルを開く。存在しない場合は初期内容で新規作成する。 */
  private async openConfigFile(filePath: string): Promise<void> {
    const uri = vscode.Uri.file(filePath);
    try {
      await vscode.workspace.fs.stat(uri);
    } catch {
      const dir = vscode.Uri.file(filePath.substring(0, filePath.lastIndexOf("/")));
      await vscode.workspace.fs.createDirectory(dir);
      await vscode.workspace.fs.writeFile(uri, Buffer.from('{\n  "$schema": "https://opencode.ai/config.json"\n}\n'));
    }
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc);
  }

  /** ファイルを開く。`line` 指定時は該当行へジャンプする。 */
  private async openFile(filePath: string, line?: number): Promise<void> {
    const uri = vscode.Uri.file(filePath);
    const doc = await vscode.workspace.openTextDocument(uri);
    const editor = await vscode.window.showTextDocument(doc);
    if (line !== undefined && line >= 1) {
      const position = new vscode.Position(line - 1, 0);
      editor.selection = new vscode.Selection(position, position);
      editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
    }
  }

  /** ワークスペース内のファイルを部分一致で検索する。 */
  private async searchWorkspaceFiles(query: string): Promise<FileAttachment[]> {
    const pattern = query ? `**/*${query}*` : "**/*";
    const uris = await vscode.workspace.findFiles(pattern, "**/node_modules/**", 20);
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri;
    return uris.map((uri) => {
      const relativePath = workspaceFolder
        ? path.relative(workspaceFolder.fsPath, uri.fsPath)
        : path.basename(uri.fsPath);
      return { filePath: relativePath, fileName: path.basename(uri.fsPath) };
    });
  }

  /** 現在開かれているテキストエディタの一覧を取得する（重複除去あり）。 */
  private async getOpenEditors(): Promise<FileAttachment[]> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri;
    return vscode.window.tabGroups.all
      .flatMap((group) => group.tabs)
      .filter((tab) => tab.input instanceof vscode.TabInputText)
      .map((tab) => {
        const uri = (tab.input as vscode.TabInputText).uri;
        const relativePath = workspaceFolder
          ? path.relative(workspaceFolder.fsPath, uri.fsPath)
          : path.basename(uri.fsPath);
        return { filePath: relativePath, fileName: path.basename(uri.fsPath) };
      })
      .filter((f, i, arr) => arr.findIndex((a) => a.filePath === f.filePath) === i);
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
