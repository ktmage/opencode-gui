import * as path from "node:path";
import type { ChatMessageWithParts, ChatSession, SendMessageOptions } from "@shared";
import type { ChatHandlerContext, Msg } from "./context";

type PromptPart =
  | { type: "text"; text: string; synthetic?: boolean }
  | { type: "file"; mime: string; url: string; filename: string }
  | { type: "agent"; name: string };

/** prompt 送信用のパーツ配列を組み立てる。 */
function toPromptParts(text: string, workspaceFolder: string, options?: SendMessageOptions): PromptPart[] {
  const parts: PromptPart[] = [];

  if (options?.skill) {
    parts.push({ type: "text", text: `/${options.skill}`, synthetic: true });
  }

  parts.push({ type: "text", text });

  if (options?.files) {
    for (const file of options.files) {
      const absPath = path.isAbsolute(file.filePath) ? file.filePath : path.resolve(workspaceFolder, file.filePath);
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

export async function sendMessage(ctx: ChatHandlerContext, msg: Msg<"sendMessage">): Promise<void> {
  await ctx.client.session.promptAsync({
    sessionID: msg.sessionId,
    parts: toPromptParts(msg.text, ctx.workspaceFolder, {
      model: msg.model,
      files: msg.files,
      agent: msg.agent,
      primaryAgent: msg.primaryAgent,
      skill: msg.skill,
    }),
    model: msg.model,
    agent: msg.primaryAgent,
  });
}

export async function editAndResend(ctx: ChatHandlerContext, msg: Msg<"editAndResend">): Promise<void> {
  // 1. 指定メッセージまで巻き戻す（そのメッセージ以降を削除）
  const session = (await ctx.client.session.revert({ sessionID: msg.sessionId, messageID: msg.messageId }))
    .data! as unknown as ChatSession;
  ctx.setActiveSession(session);
  ctx.postMessage({ type: "activeSession", session });
  const messages = (await ctx.client.session.messages({ sessionID: msg.sessionId }))
    .data! as unknown as ChatMessageWithParts[];
  ctx.postMessage({ type: "messages", sessionId: msg.sessionId, messages });
  // 2. 編集後のテキストを送信
  await ctx.client.session.promptAsync({
    sessionID: msg.sessionId,
    parts: toPromptParts(msg.text, ctx.workspaceFolder, { model: msg.model, files: msg.files }),
    model: msg.model,
    agent: undefined,
  });
}

export async function executeShell(ctx: ChatHandlerContext, msg: Msg<"executeShell">): Promise<void> {
  await ctx.client.session.shell({
    sessionID: msg.sessionId,
    agent: "default",
    command: msg.command,
    model: msg.model,
  });
}

export async function abort(ctx: ChatHandlerContext, msg: Msg<"abort">): Promise<void> {
  await ctx.client.session.abort({ sessionID: msg.sessionId });
}

export async function replyPermission(ctx: ChatHandlerContext, msg: Msg<"replyPermission">): Promise<void> {
  await ctx.client.permission.reply({ requestID: msg.permissionId, reply: msg.response });
}

export async function replyQuestion(ctx: ChatHandlerContext, msg: Msg<"replyQuestion">): Promise<void> {
  await ctx.client.question.reply({ requestID: msg.requestId, answers: msg.answers });
}

export async function rejectQuestion(ctx: ChatHandlerContext, msg: Msg<"rejectQuestion">): Promise<void> {
  await ctx.client.question.reject({ requestID: msg.requestId });
}

