import * as vscode from "vscode";
import { messages } from "./source";

/**
 * `messages` の構造から `"warnings.noWorkspace"` のようなドット区切りキー集合を導出する型。
 */
type Leaves<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];

export type MessageKey = Leaves<typeof messages>;

/**
 * `t()` に渡されたキーが `source.ts` の構造に存在しなかった場合に投げられる例外。
 * 通常は `MessageKey` 型でコンパイル時に弾かれるため、これが投げられた場合は
 * 型キャストの誤用などで型の保護が外れたバグとみなせる。
 */
export class I18nKeyNotFoundError extends Error {
  constructor(public readonly key: string) {
    super(`i18n のソースにキーが存在しません: ${key}`);
    this.name = "I18nKeyNotFoundError";
  }
}

/**
 * Rails I18n 風のキーベース翻訳取得。
 * `source.ts` から英文を引き、それをバンドルキーとして `vscode.l10n.t` に渡す。
 * バンドル未ヒット時は英文がそのまま返るため、フォールバックは自動で機能する。
 */
export function t(key: MessageKey): string {
  return vscode.l10n.t(resolveSource(key));
}

function resolveSource(key: string): string {
  const value = key.split(".").reduce<unknown>((current, segment) => {
    if (current && typeof current === "object" && segment in current) {
      return (current as Record<string, unknown>)[segment];
    }
    return undefined;
  }, messages);
  if (typeof value !== "string") {
    throw new I18nKeyNotFoundError(key);
  }
  return value;
}
