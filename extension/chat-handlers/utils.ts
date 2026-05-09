import * as path from "node:path";
import type { FileAttachment } from "@shared";
import * as vscode from "vscode";

/**
 * アクティブなテキストエディタから FileAttachment を生成する。
 * エディタが無い、または file スキーム以外（出力パネル等）の場合は null を返す。
 */
export function getActiveEditorFile(editor: vscode.TextEditor | undefined): FileAttachment | null {
  if (!editor) return null;
  const uri = editor.document.uri;
  if (uri.scheme !== "file") return null;
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri;
  const relativePath = workspaceFolder
    ? path.relative(workspaceFolder.fsPath, uri.fsPath)
    : path.basename(uri.fsPath);
  return { filePath: relativePath, fileName: path.basename(uri.fsPath) };
}
