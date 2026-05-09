/**
 * メッセージの英語ソース。すべての翻訳キーの正本。
 * `bundle.l10n.<lang>.json` は本ファイルのキー（ドット区切り表記）を JSON のキーとして持つ。
 * 各言語バンドルにキーが無い場合、`t()` はここに定義された英文へフォールバックする。
 */
export const messages = {
  warnings: {
    noWorkspace: "OpenCodeGUI requires an open workspace folder.",
    opencodeNotFound:
      'OpenCodeGUI: "opencode" command not found. Please install OpenCode first: https://github.com/anomalyco/opencode',
  },
  errors: {
    unexpected:
      "OpenCodeGUI: An unexpected error occurred while starting OpenCode. See the developer log for details.",
  },
  info: {
    difitNotAvailable:
      'OpenCodeGUI: "difit" command not found. The diff review feature will be disabled. Install difit to enable it.',
  },
} as const;
