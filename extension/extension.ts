import { execFile } from "node:child_process";
import * as vscode from "vscode";
import { ChatViewProvider } from "./chat-view-provider";
import { DiffReviewManager } from "./diff-review-manager";
import { OpenCodeBinaryNotFoundError, OpenCodeError } from "./errors";
import { t } from "./i18n";
import { OpenCodeClientHandle } from "./opencode-client-handle";
import { VscodePlatformServices } from "./vscode-platform-services";

const openCodeClientHandle = new OpenCodeClientHandle();

// Extension Host プロセスが強制終了された場合でもサーバーを停止する
process.on("exit", () => openCodeClientHandle.disconnect());

/**
 * VS Code から呼ばれる拡張機能のエントリポイント。
 * 呼び出し契機は `package.json` の `activationEvents` および `contributes` 宣言で定義されている。
 */
export async function activate(context: vscode.ExtensionContext) {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceFolder) {
    vscode.window.showWarningMessage(t("warnings.noWorkspace"));
    return;
  }

  // SDK の createOpencodeServer は cwd オプションを持たないため、
  // プロセスのカレントディレクトリを変更してからサーバーを起動する。
  const originalCwd = process.cwd();
  process.chdir(workspaceFolder);
  try {
    await openCodeClientHandle.connect();
  } catch (error) {
    if (error instanceof OpenCodeBinaryNotFoundError) {
      vscode.window.showWarningMessage(t("warnings.opencodeNotFound"));
      return;
    }
    if (error instanceof OpenCodeError) {
      console.error(error);
      vscode.window.showErrorMessage(t("errors.unexpected"));
      return;
    }
    throw error;
  } finally {
    process.chdir(originalCwd);
  }

  const platformServices = new VscodePlatformServices();

  // PATH 上に difit が存在するか確認する。
  // 存在しない場合はレビューボタンを非表示にするだけでエラーは出さない。
  const difitAvailable = await checkDifitAvailable();

  const diffReviewManager = new DiffReviewManager();
  const chatViewProvider = new ChatViewProvider(
    context.extensionUri,
    openCodeClientHandle,
    workspaceFolder,
    platformServices,
    diffReviewManager,
    difitAvailable,
  );
  context.subscriptions.push(vscode.window.registerWebviewViewProvider(ChatViewProvider.viewType, chatViewProvider));
  context.subscriptions.push(diffReviewManager);

  // diff エディタ用の仮想ドキュメントプロバイダー。
  // URI のクエリ部分にエンコードされたコンテンツを返す。
  const diffContentProvider: vscode.TextDocumentContentProvider = {
    provideTextDocumentContent(uri: vscode.Uri): string {
      return decodeURIComponent(uri.query);
    },
  };
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider("opencode-diff-before", diffContentProvider),
    vscode.workspace.registerTextDocumentContentProvider("opencode-diff-after", diffContentProvider),
  );

  context.subscriptions.push(new vscode.Disposable(() => openCodeClientHandle.disconnect()));
}

/**
 * VS Code から呼ばれる拡張機能の終了フック。
 * ウィンドウを閉じる・拡張を無効化する・リロードするタイミングで呼ばれる。
 * `context.subscriptions` 管理外のリソースはここで解放する必要がある。
 */
export function deactivate() {
  openCodeClientHandle.disconnect();
}

/** PATH 上に difit コマンドが存在するかチェックする */
function checkDifitAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    execFile("which", ["difit"], (error) => {
      resolve(!error);
    });
  });
}
