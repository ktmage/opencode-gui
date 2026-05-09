import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { OpencodeClient } from "@opencode-ai/sdk/v2";
import type { AgentInfo, AllProvidersData, AppPaths, ProviderInfo, SkillInfo } from "@shared";
import * as vscode from "vscode";
import type { ChatHandlerContext, Msg } from "./context";

/** opencode.json に model を書き込む。ファイルが無ければ新規作成する。 */
async function setConfiguredModel(client: OpencodeClient, model: string): Promise<void> {
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

export async function getProviders(ctx: ChatHandlerContext): Promise<void> {
  const [providersResponse, allProvidersResponse, pathsResponse] = await Promise.all([
    ctx.client.config.providers(),
    ctx.client.provider.list(),
    ctx.client.path.get(),
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
  ctx.postMessage({
    type: "providers",
    providers: providersData.providers as unknown as ProviderInfo[],
    allProviders,
    default: providersData.default,
    configModel,
  });
}

export async function getAgents(ctx: ChatHandlerContext): Promise<void> {
  const agents = (await ctx.client.app.agents()).data! as unknown as AgentInfo[];
  ctx.postMessage({ type: "agents", agents });
}

export async function getSkills(ctx: ChatHandlerContext): Promise<void> {
  const skills = (await ctx.client.app.skills()).data! as unknown as SkillInfo[];
  ctx.postMessage({ type: "skills", skills });
}

export async function setModel(ctx: ChatHandlerContext, msg: Msg<"setModel">): Promise<void> {
  await setConfiguredModel(ctx.client, msg.model);
  ctx.postMessage({ type: "modelUpdated", model: msg.model, default: {} });
}

/** 設定ファイルを開く。存在しない場合は初期内容で新規作成する。 */
export async function openConfigFile(_ctx: ChatHandlerContext, msg: Msg<"openConfigFile">): Promise<void> {
  const uri = vscode.Uri.file(msg.filePath);
  try {
    await vscode.workspace.fs.stat(uri);
  } catch {
    const dir = vscode.Uri.file(msg.filePath.substring(0, msg.filePath.lastIndexOf("/")));
    await vscode.workspace.fs.createDirectory(dir);
    await vscode.workspace.fs.writeFile(uri, Buffer.from('{\n  "$schema": "https://opencode.ai/config.json"\n}\n'));
  }
  const doc = await vscode.workspace.openTextDocument(uri);
  await vscode.window.showTextDocument(doc);
}
