import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { AllProvidersData, AppPaths, ChatSession, ProviderInfo } from "@shared";
import * as vscode from "vscode";
import type { ChatHandlerContext } from "./context";
import { getActiveEditorFile } from "./utils";

/**
 * Webview の初期化完了通知に応じて、UI が起動時に必要とする情報を一括送信する。
 */
export async function ready(ctx: ChatHandlerContext): Promise<void> {
  const { client, postMessage } = ctx;

  const paths = (await client.path.get()).data! as unknown as AppPaths;
  postMessage({
    type: "init",
    locale: vscode.env.language,
    paths,
  });

  const sessions = (await client.session.list()).data! as unknown as ChatSession[];
  postMessage({ type: "sessions", sessions });
  postMessage({ type: "activeSession", session: ctx.getActiveSession() });

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
    configModel = JSON.parse(raw).model;
  } catch {
    // ファイルが存在しない場合は undefined のまま
  }
  postMessage({
    type: "providers",
    providers: providersData.providers as unknown as ProviderInfo[],
    allProviders,
    default: providersData.default,
    configModel,
  });

  postMessage({ type: "activeEditor", file: getActiveEditorFile(vscode.window.activeTextEditor) });
  postMessage({ type: "difitAvailable", available: ctx.difitHandle.isAvailable() });
}
