import type { ChatMessageWithParts, ChatSession, FileDiff, TodoItem } from "@shared";
import * as vscode from "vscode";
import type { ChatHandlerContext, Msg } from "./context";

export async function createSession(ctx: ChatHandlerContext, msg: Msg<"createSession">): Promise<void> {
  const session = (await ctx.client.session.create({ title: msg.title })).data! as unknown as ChatSession;
  ctx.setActiveSession(session);
  ctx.postMessage({ type: "activeSession", session });
  const sessions = (await ctx.client.session.list()).data! as unknown as ChatSession[];
  ctx.postMessage({ type: "sessions", sessions });
}

export async function listSessions(ctx: ChatHandlerContext): Promise<void> {
  const sessions = (await ctx.client.session.list()).data! as unknown as ChatSession[];
  ctx.postMessage({ type: "sessions", sessions });
}

export async function selectSession(ctx: ChatHandlerContext, msg: Msg<"selectSession">): Promise<void> {
  const session = (await ctx.client.session.get({ sessionID: msg.sessionId })).data! as unknown as ChatSession;
  ctx.setActiveSession(session);
  ctx.postMessage({ type: "activeSession", session });
  const messages = (await ctx.client.session.messages({ sessionID: msg.sessionId }))
    .data! as unknown as ChatMessageWithParts[];
  ctx.postMessage({ type: "messages", sessionId: msg.sessionId, messages });
}

export async function deleteSession(ctx: ChatHandlerContext, msg: Msg<"deleteSession">): Promise<void> {
  await ctx.client.session.delete({ sessionID: msg.sessionId });
  if (ctx.getActiveSession()?.id === msg.sessionId) {
    ctx.setActiveSession(null);
    ctx.postMessage({ type: "activeSession", session: null });
  }
  const sessions = (await ctx.client.session.list()).data! as unknown as ChatSession[];
  ctx.postMessage({ type: "sessions", sessions });
}

export async function getMessages(ctx: ChatHandlerContext, msg: Msg<"getMessages">): Promise<void> {
  const messages = (await ctx.client.session.messages({ sessionID: msg.sessionId }))
    .data! as unknown as ChatMessageWithParts[];
  ctx.postMessage({ type: "messages", sessionId: msg.sessionId, messages });
}

export async function compressSession(ctx: ChatHandlerContext, msg: Msg<"compressSession">): Promise<void> {
  await ctx.client.session.summarize({
    sessionID: msg.sessionId,
    providerID: msg.model?.providerID,
    modelID: msg.model?.modelID,
  });
}

export async function revertToMessage(ctx: ChatHandlerContext, msg: Msg<"revertToMessage">): Promise<void> {
  const session = (await ctx.client.session.revert({ sessionID: msg.sessionId, messageID: msg.messageId }))
    .data! as unknown as ChatSession;
  ctx.setActiveSession(session);
  ctx.postMessage({ type: "activeSession", session });
  const messages = (await ctx.client.session.messages({ sessionID: msg.sessionId }))
    .data! as unknown as ChatMessageWithParts[];
  ctx.postMessage({ type: "messages", sessionId: msg.sessionId, messages });
}

export async function forkSession(ctx: ChatHandlerContext, msg: Msg<"forkSession">): Promise<void> {
  const forked = (await ctx.client.session.fork({ sessionID: msg.sessionId, messageID: msg.messageId }))
    .data! as unknown as ChatSession;
  ctx.setActiveSession(forked);
  ctx.postMessage({ type: "activeSession", session: forked });
  const sessions = (await ctx.client.session.list()).data! as unknown as ChatSession[];
  ctx.postMessage({ type: "sessions", sessions });
}

export async function getSessionDiff(ctx: ChatHandlerContext, msg: Msg<"getSessionDiff">): Promise<void> {
  const diffs = (await ctx.client.session.diff({ sessionID: msg.sessionId })).data! as unknown as FileDiff[];
  ctx.postMessage({ type: "sessionDiff", sessionId: msg.sessionId, diffs });
}

export async function getSessionTodos(ctx: ChatHandlerContext, msg: Msg<"getSessionTodos">): Promise<void> {
  const todos = (await ctx.client.session.todo({ sessionID: msg.sessionId })).data! as unknown as TodoItem[];
  ctx.postMessage({ type: "sessionTodos", sessionId: msg.sessionId, todos });
}

export async function getChildSessions(ctx: ChatHandlerContext, msg: Msg<"getChildSessions">): Promise<void> {
  const children = (await ctx.client.session.children({ sessionID: msg.sessionId }))
    .data! as unknown as ChatSession[];
  ctx.postMessage({ type: "childSessions", sessionId: msg.sessionId, children });
}

export async function shareSession(ctx: ChatHandlerContext, msg: Msg<"shareSession">): Promise<void> {
  const session = (await ctx.client.session.share({ sessionID: msg.sessionId })).data! as unknown as ChatSession;
  ctx.setActiveSession(session);
  ctx.postMessage({ type: "activeSession", session });
  // 共有 URL をクリップボードにコピーする
  if (session.share?.url) {
    await vscode.env.clipboard.writeText(session.share.url);
  }
}

export async function unshareSession(ctx: ChatHandlerContext, msg: Msg<"unshareSession">): Promise<void> {
  const session = (await ctx.client.session.unshare({ sessionID: msg.sessionId })).data! as unknown as ChatSession;
  ctx.setActiveSession(session);
  ctx.postMessage({ type: "activeSession", session });
}

export async function undoSession(ctx: ChatHandlerContext, msg: Msg<"undoSession">): Promise<void> {
  const session = (await ctx.client.session.revert({ sessionID: msg.sessionId, messageID: msg.messageId }))
    .data! as unknown as ChatSession;
  ctx.setActiveSession(session);
  ctx.postMessage({ type: "activeSession", session });
  const messages = (await ctx.client.session.messages({ sessionID: msg.sessionId }))
    .data! as unknown as ChatMessageWithParts[];
  ctx.postMessage({ type: "messages", sessionId: msg.sessionId, messages });
}

export async function redoSession(ctx: ChatHandlerContext, msg: Msg<"redoSession">): Promise<void> {
  const session = (await ctx.client.session.unrevert({ sessionID: msg.sessionId })).data! as unknown as ChatSession;
  ctx.setActiveSession(session);
  ctx.postMessage({ type: "activeSession", session });
  const messages = (await ctx.client.session.messages({ sessionID: msg.sessionId }))
    .data! as unknown as ChatMessageWithParts[];
  ctx.postMessage({ type: "messages", sessionId: msg.sessionId, messages });
}
