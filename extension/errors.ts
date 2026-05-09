/**
 * 拡張機能内で利用するドメイン例外クラスの集約。
 * 複数モジュールから参照されるため、本ファイルに集めてモジュール間の依存を一方向に保つ。
 */

/**
 * OpenCode 関連エラーの汎用クラス兼基底クラス。
 * 特定の失敗モードに分類されない OpenCode 由来の失敗を表すと同時に、
 * `OpenCodeBinaryNotFoundError` などのサブクラスの基底としても機能する。
 * 呼び出し側は `instanceof OpenCodeError` で OpenCode 由来の失敗をまとめて受けられる。
 */
export class OpenCodeError extends Error {
  constructor(public readonly cause?: unknown) {
    super("OpenCode で予期しないエラーが発生しました。");
    this.name = "OpenCodeError";
  }
}

/** OpenCode クライアントが未接続の状態で要求された場合のエラー。 */
export class OpenCodeClientNotConnectedError extends OpenCodeError {
  constructor() {
    super();
    this.message = "OpenCode クライアントが接続されていません。先に connect() を呼び出してください。";
    this.name = "OpenCodeClientNotConnectedError";
  }
}

/**
 * `opencode` バイナリが PATH 上に見つからず、サーバーを起動できなかった場合のエラー。
 * 子プロセス spawn 時の ENOENT を本クラスに変換することで、
 * 呼び出し側は `instanceof` で「未インストール」を識別できる。
 */
export class OpenCodeBinaryNotFoundError extends OpenCodeError {
  constructor(cause: unknown) {
    super(cause);
    this.message = '"opencode" コマンドが PATH 上に見つかりませんでした。OpenCode をインストールしてください。';
    this.name = "OpenCodeBinaryNotFoundError";
  }
}
