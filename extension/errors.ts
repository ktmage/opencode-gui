/**
 * 拡張機能内で利用するドメイン例外クラスの集約。
 * 複数モジュールから参照されるため、本ファイルに集めてモジュール間の依存を一方向に保つ。
 */

/**
 * OpenCode 関連エラーの抽象基底クラス。
 * 直接インスタンス化はできず、必ず具体的な失敗モードを表すサブクラスを継承して使う。
 * 呼び出し側は `instanceof OpenCodeError` で OpenCode 由来の失敗をまとめて受けられる。
 */
export abstract class OpenCodeError extends Error {
  protected constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "OpenCodeError";
  }
}

/** OpenCode クライアントが未接続の状態で要求された場合のエラー。 */
export class OpenCodeClientNotConnectedError extends OpenCodeError {
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
export class OpenCodeBinaryNotFoundError extends OpenCodeError {
  constructor(cause: unknown) {
    super('"opencode" コマンドが PATH 上に見つかりませんでした。OpenCode をインストールしてください。', cause);
    this.name = "OpenCodeBinaryNotFoundError";
  }
}

/**
 * OpenCode サーバーの起動に失敗した（ENOENT 以外の原因による）場合のエラー。
 * ポート衝突や SDK 側の予期せぬ失敗など、特定の失敗モードに分類されない起動失敗を表す。
 */
export class OpenCodeServerStartError extends OpenCodeError {
  constructor(cause: unknown) {
    super("OpenCode サーバーの起動に失敗しました。", cause);
    this.name = "OpenCodeServerStartError";
  }
}
