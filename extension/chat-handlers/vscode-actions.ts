import * as path from "node:path";
import type { FileAttachment, FileDiff } from "@shared";
import * as vscode from "vscode";
import type { ChatHandlerContext, Msg } from "./context";

/** 現在開かれているテキストエディタの一覧を取得する（重複除去あり）。 */
export async function getOpenEditors(ctx: ChatHandlerContext): Promise<void> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri;
  const files = vscode.window.tabGroups.all
    .flatMap((group) => group.tabs)
    .filter((tab) => tab.input instanceof vscode.TabInputText)
    .map((tab): FileAttachment => {
      const uri = (tab.input as vscode.TabInputText).uri;
      const relativePath = workspaceFolder
        ? path.relative(workspaceFolder.fsPath, uri.fsPath)
        : path.basename(uri.fsPath);
      return { filePath: relativePath, fileName: path.basename(uri.fsPath) };
    })
    .filter((f, i, arr) => arr.findIndex((a) => a.filePath === f.filePath) === i);
  ctx.postMessage({ type: "openEditors", files });
}

/** ワークスペース内のファイルを部分一致で検索する。 */
export async function searchWorkspaceFiles(ctx: ChatHandlerContext, msg: Msg<"searchWorkspaceFiles">): Promise<void> {
  const pattern = msg.query ? `**/*${msg.query}*` : "**/*";
  const uris = await vscode.workspace.findFiles(pattern, "**/node_modules/**", 20);
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri;
  const files = uris.map((uri): FileAttachment => {
    const relativePath = workspaceFolder
      ? path.relative(workspaceFolder.fsPath, uri.fsPath)
      : path.basename(uri.fsPath);
    return { filePath: relativePath, fileName: path.basename(uri.fsPath) };
  });
  ctx.postMessage({ type: "workspaceFiles", files });
}

/** OpenCode サーバーへ attach するためのターミナルを開く。 */
export async function openTerminal(ctx: ChatHandlerContext): Promise<void> {
  const serverUrl = ctx.openCodeClientHandle.getServerUrl();
  if (!serverUrl) return;
  const args = ["attach", serverUrl];
  const sessionId = ctx.getActiveSession()?.id;
  if (sessionId) {
    args.push("--session", sessionId);
  }
  const wsFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const terminal = vscode.window.createTerminal({ name: "OpenCode", cwd: wsFolder });
  terminal.show();
  terminal.sendText(`opencode ${args.map((a) => JSON.stringify(a)).join(" ")}`);
}

/** 仮想ドキュメントを使って VS Code のネイティブ diff エディタを開く。 */
export async function openDiffEditor(_ctx: ChatHandlerContext, msg: Msg<"openDiffEditor">): Promise<void> {
  const beforeUri = vscode.Uri.parse(`opencode-diff-before:${msg.filePath}?${encodeURIComponent(msg.before)}`);
  const afterUri = vscode.Uri.parse(`opencode-diff-after:${msg.filePath}?${encodeURIComponent(msg.after)}`);
  const fileName = path.basename(msg.filePath);
  await vscode.commands.executeCommand("vscode.diff", beforeUri, afterUri, `${fileName} (Changes)`);
}

/** ファイルを開く。`line` 指定時は該当行へジャンプする。 */
export async function openFile(_ctx: ChatHandlerContext, msg: Msg<"openFile">): Promise<void> {
  const uri = vscode.Uri.file(msg.filePath);
  const doc = await vscode.workspace.openTextDocument(uri);
  const editor = await vscode.window.showTextDocument(doc);
  if (msg.line !== undefined && msg.line >= 1) {
    const position = new vscode.Position(msg.line - 1, 0);
    editor.selection = new vscode.Selection(position, position);
    editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
  }
}

export async function copyToClipboard(_ctx: ChatHandlerContext, msg: Msg<"copyToClipboard">): Promise<void> {
  await vscode.env.clipboard.writeText(msg.text);
}

export async function openDiffReview(ctx: ChatHandlerContext, msg: Msg<"openDiffReview">): Promise<void> {
  const session = ctx.getActiveSession();
  if (!session) return;
  try {
    const diffs = (await ctx.client.session.diff({ sessionID: session.id })).data! as unknown as FileDiff[];
    if (diffs.length === 0) return;
    await ctx.difitHandle.start(diffs, msg.focusFile);
    ctx.postMessage({ type: "diffReviewStarted" });
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    console.error("[openDiffReview]", errorMsg);
    ctx.postMessage({ type: "diffReviewError", error: errorMsg });
  }
}

export async function stopDiffReview(ctx: ChatHandlerContext): Promise<void> {
  ctx.difitHandle.stop();
  ctx.postMessage({ type: "diffReviewStopped" });
}
