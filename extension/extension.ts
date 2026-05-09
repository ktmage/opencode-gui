import { execFile } from "node:child_process";
import * as vscode from "vscode";
import { ChatViewProvider } from "./chat-view-provider";
import { DiffReviewManager } from "./diff-review-manager";
import { OpenCodeBinaryNotFoundError, OpenCodeError } from "./errors";
import { t } from "./i18n";
import { OpenCodeClientHandle } from "./opencode-client-handle";

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

  if (!(await connectOpenCode(workspaceFolder))) {
    return;
  }

  const difitAvailable = await checkDifitAvailable();
  if (!difitAvailable) {
    vscode.window.showInformationMessage(t("info.difitNotAvailable"));
  }

  const diffReviewManager = new DiffReviewManager();
  const chatViewProvider = new ChatViewProvider(
    context.extensionUri,
    openCodeClientHandle,
    workspaceFolder,
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

/**
 * 指定したワークスペースフォルダで OpenCode サーバーへ接続する。
 * 失敗種別に応じてユーザー通知を出し、`activate` を続行すべきかを真偽値で返す。
 *
 * @returns 接続成功時 true。通知済みで activate を中止すべき場合 false。
 * @throws OpenCode に由来しない想定外のエラー。
 */
async function connectOpenCode(workspaceFolder: string): Promise<boolean> {
  // SDK の createOpencodeServer は cwd オプションを持たないため、
  // プロセスのカレントディレクトリを変更してからサーバーを起動する。
  const originalCwd = process.cwd();
  process.chdir(workspaceFolder);
  try {
    await openCodeClientHandle.connect();
    return true;
  } catch (error) {
    if (error instanceof OpenCodeBinaryNotFoundError) {
      vscode.window.showWarningMessage(t("warnings.opencodeNotFound"));
      return false;
    }
    if (error instanceof OpenCodeError) {
      console.error(error);
      vscode.window.showErrorMessage(t("errors.unexpected"));
      return false;
    }
    throw error;
  } finally {
    process.chdir(originalCwd);
  }
}

/** PATH 上に difit コマンドが存在するかチェックする */
function checkDifitAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    execFile("which", ["difit"], (error) => {
      resolve(!error);
    });
  });
}
