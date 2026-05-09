import type { ChildProcess } from "node:child_process";
import { execFile, spawn } from "node:child_process";
import type { FileDiff } from "@shared";
import { createTwoFilesPatch } from "diff";
import * as vscode from "vscode";
import { DifitBinaryNotFoundError, DifitError } from "./errors";

/** spawn 失敗が ENOENT（実行ファイル未検出）を示しているか判定する。 */
function isBinaryNotFoundError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as NodeJS.ErrnoException).code;
  return code === "ENOENT" || error.message.includes("ENOENT");
}

/**
 * difit という外部プロセスとのやり取りを集約するハンドル。
 * `OpenCodeClientHandle` と同じく「外部プロセスの存在確認 + ライフサイクル管理」を 1 クラスに閉じる。
 *
 * 使い方:
 * 1. `init()` で PATH 上の存在を確認する（結果はキャッシュされる）
 * 2. `isAvailable()` で利用可否を取得する
 * 3. `start()` でレビュー画面を起動、`stop()` / `dispose()` で停止
 */
export class DifitHandle implements vscode.Disposable {
  private process: ChildProcess | null = null;
  private serverUrl: string | null = null;
  private available: boolean | undefined;

  /** PATH 上に difit コマンドが存在するか確認する。結果は内部にキャッシュされる。 */
  async init(): Promise<void> {
    this.available = await new Promise<boolean>((resolve) => {
      execFile("which", ["difit"], (error) => {
        resolve(!error);
      });
    });
  }

  /**
   * `init()` で確認した利用可否を返す。
   * `init()` 未実行の場合は `false` を返す（フェイルセーフ）。
   */
  isAvailable(): boolean {
    return this.available === true;
  }

  /**
   * difit プロセスを起動しシステムブラウザでレビュー画面を開く。
   * 既にプロセスが起動中の場合は kill して再起動する。
   */
  async start(diffs: FileDiff[], focusFile?: string): Promise<void> {
    this.stop();

    const unifiedDiff = fileDiffsToUnifiedDiff(diffs);

    const url = await this.spawnDifit(unifiedDiff);
    this.serverUrl = url;

    const targetUrl = focusFile ? `${url}#${focusFile}` : url;
    await vscode.env.openExternal(vscode.Uri.parse(targetUrl));
  }

  /** 実行中の difit プロセスを停止する */
  stop(): void {
    if (this.process) {
      this.process.kill();
      this.process = null;
      this.serverUrl = null;
    }
  }

  dispose(): void {
    this.stop();
  }

  /**
   * difit を子プロセスとして起動し、stdin に unified diff を書き込む。
   * stdout から http://... の URL を検出して返す。
   *
   * @throws {@link DifitBinaryNotFoundError} `difit` バイナリが PATH 上に存在しない場合。
   * @throws {@link DifitError} それ以外の理由で difit の起動に失敗した場合。
   */
  private spawnDifit(unifiedDiff: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const child = spawn("difit", ["-", "--no-open"], { stdio: ["pipe", "pipe", "pipe"] });
      this.process = child;

      const { stdout, stderr, stdin } = child;
      if (!stdout || !stderr || !stdin) {
        reject(new DifitError(new Error("Failed to create stdio streams")));
        return;
      }

      let output = "";
      const urlPattern = /https?:\/\/(?:localhost|127\.0\.0\.1):\d+/;

      const handleData = (chunk: Buffer) => {
        output += chunk.toString();
        // difit は起動後に "http://localhost:XXXX" を stderr に出力する
        const match = output.match(urlPattern);
        if (match) {
          resolve(match[0]);
        }
      };

      stdout.on("data", handleData);
      stderr.on("data", handleData);

      child.on("error", (err) => {
        this.process = null;
        if (isBinaryNotFoundError(err)) {
          reject(new DifitBinaryNotFoundError(err));
        } else {
          reject(new DifitError(err));
        }
      });

      child.on("close", (code) => {
        this.process = null;
        if (!this.serverUrl) {
          reject(new DifitError(new Error(`difit exited with code ${code} before emitting URL`)));
        }
      });

      stdin.write(unifiedDiff);
      stdin.end();
    });
  }
}

/**
 * FileDiff[] を git diff 形式のテキストに変換する。
 * difit は `diff --git` ヘッダーを必要とするため、jsdiff の出力を変換する。
 */
export function fileDiffsToUnifiedDiff(diffs: FileDiff[]): string {
  return diffs
    .map((d) => {
      if ("patch" in d) {
        return d.patch;
      }
      const patch = createTwoFilesPatch(`a/${d.file}`, `b/${d.file}`, d.before, d.after);
      // jsdiff は "===...===" ヘッダーを出力するが difit は "diff --git" を期待する
      return patch.replace(/^={10,}\n/, `diff --git a/${d.file} b/${d.file}\n`);
    })
    .join("\n");
}
