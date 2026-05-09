/**
 * 拡張機能内で利用するドメイン例外クラスの集約。
 * 複数モジュールから参照されるため、本ファイルに集めてモジュール間の依存を一方向に保つ。
 */

/** OpenCode クライアントが未接続の状態で要求された場合のエラー。 */
export class OpenCodeClientNotConnectedError extends Error {
  constructor() {
    super("OpenCode クライアントが接続されていません。先に connect() を呼び出してください。");
    this.name = "OpenCodeClientNotConnectedError";
  }
}

/**
 * `opencode` バイナリが PATH 上に見つからず、サーバーを起動できなかった場合のエラー。
 * 子プロセス spawn 時の ENOENT を本クラスに変換することで、
 * 呼び出し側は `instanceof` で「未インストール」を識別できる。
 */
export class OpenCodeBinaryNotFoundError extends Error {
  constructor(public readonly cause: unknown) {
    super('"opencode" コマンドが PATH 上に見つかりませんでした。OpenCode をインストールしてください。');
    this.name = "OpenCodeBinaryNotFoundError";
  }
}
