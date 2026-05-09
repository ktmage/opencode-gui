import type { TodoItem } from "@shared";

function normalizeTodo(item: { content: string; status?: unknown; priority?: unknown }): TodoItem {
  return {
    content: item.content,
    status: typeof item.status === "string" ? item.status : "pending",
    priority: typeof item.priority === "string" ? item.priority : "medium",
  };
}

export function parseTodos(raw: unknown): TodoItem[] | null {
  try {
    const data = typeof raw === "string" ? JSON.parse(raw) : raw;
    const arr = Array.isArray(data) ? data : (data?.todos ?? data?.items ?? null);
    if (!Array.isArray(arr) || arr.length === 0) return null;
    if (!arr.every((item: unknown) => typeof item === "object" && item !== null && "content" in item)) return null;
    return arr.map((item) => normalizeTodo(item as { content: string; status?: unknown; priority?: unknown }));
  } catch {
    return null;
  }
}

export type { TodoItem };
