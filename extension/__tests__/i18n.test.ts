/**
 * i18n モジュールのユニットテスト。
 * `t()` が source.ts の英文を引いて vscode.l10n.t に渡し、
 * バンドルヒット時は翻訳、未ヒット時は英文へフォールバックすることを検証する。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { I18nKeyNotFoundError, type MessageKey, t } from "../i18n";
import { messages } from "../i18n/source";

describe("t", () => {
  beforeEach(() => {
    // 既定のモック: 入力をそのまま返す（= バンドル未ヒット相当）。
    // l10n.t は複数のオーバーロードを持つため as never 経由で差し替える。
    vi.mocked(vscode.l10n.t).mockImplementation(((s: string) => s) as never);
  });

  it("source.ts に定義された英文を vscode.l10n.t に渡す", () => {
    const result = t("warnings.noWorkspace");
    expect(vscode.l10n.t).toHaveBeenCalledWith(messages.warnings.noWorkspace);
    expect(result).toBe(messages.warnings.noWorkspace);
  });

  it("vscode.l10n.t が翻訳を返した場合はその翻訳を返す（バンドルヒット）", () => {
    vi.mocked(vscode.l10n.t).mockReturnValueOnce("ワークスペースを開いてください。");
    expect(t("warnings.noWorkspace")).toBe("ワークスペースを開いてください。");
  });

  it("vscode.l10n.t が引数をそのまま返した場合は英文フォールバックになる", () => {
    expect(t("warnings.opencodeNotFound")).toBe(messages.warnings.opencodeNotFound);
  });

  it("source.ts に存在しないキーが渡された場合は I18nKeyNotFoundError を投げる", () => {
    // 通常は MessageKey 型で弾かれる経路。型キャストでバイパスして検証する。
    expect(() => t("warnings.unknown" as MessageKey)).toThrow(I18nKeyNotFoundError);
    expect(() => t("nonexistent.key" as MessageKey)).toThrow(/i18n のソースにキーが存在しません/);
  });
});
