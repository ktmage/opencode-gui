import { fireEvent, render } from "@testing-library/react";
import { Marked } from "marked";
import { describe, expect, it, vi } from "vitest";
import { TextPartView } from "../../../components/molecules/TextPartView";
import { postMessage } from "../../../vscode-api";
import { createTextPart } from "../../factories";

describe("TextPartView", () => {
  // when rendered with a text part
  context("テキストパートを渡した場合", () => {
    // renders HTML content
    it("HTML コンテンツをレンダリングすること", () => {
      const part = createTextPart("Hello world");
      const { container } = render(<TextPartView part={part} />);
      expect(container.querySelector(".markdown")).toBeInTheDocument();
    });

    // renders the text
    it("テキストを表示すること", () => {
      const part = createTextPart("Hello world");
      const { container } = render(<TextPartView part={part} />);
      expect(container.textContent).toContain("Hello world");
    });
  });

  // when text changes
  context("テキストが異なる場合", () => {
    // renders updated text
    it("更新されたテキストを表示すること", () => {
      const part = createTextPart("Updated text");
      const { container } = render(<TextPartView part={part} />);
      expect(container.textContent).toContain("Updated text");
    });
  });

  // XSS protection via DOMPurify
  context("悪意のある HTML を含むテキストの場合", () => {
    // strips <script> tags
    it("<script> タグが除去されること", () => {
      const part = createTextPart('<script>alert("xss")</script>');
      const { container } = render(<TextPartView part={part} />);
      expect(container.querySelector("script")).toBeNull();
    });

    // strips onerror attributes
    it("onerror 属性が除去されること", () => {
      const part = createTextPart('<img src="x" onerror="alert(1)">');
      const { container } = render(<TextPartView part={part} />);
      expect(container.innerHTML).not.toContain("onerror");
    });

    // strips javascript: URLs
    it("javascript: URL が除去されること", () => {
      const part = createTextPart('<a href="javascript:alert(1)">click</a>');
      const { container } = render(<TextPartView part={part} />);
      expect(container.innerHTML).not.toContain("javascript:");
    });

    // strips <iframe> tags
    it("<iframe> タグが除去されること", () => {
      const part = createTextPart('<iframe src="https://evil.com"></iframe>');
      const { container } = render(<TextPartView part={part} />);
      expect(container.querySelector("iframe")).toBeNull();
    });

    // preserves safe HTML content
    it("安全な HTML コンテンツは保持されること", () => {
      const part = createTextPart("safe <b>bold</b> text");
      const { container } = render(<TextPartView part={part} />);
      expect(container.textContent).toContain("safe bold text");
    });
  });

  // file path link click handling
  context("ファイルパスリンクをクリックした場合", () => {
    // sends openFile message when file link is clicked
    it("openFile メッセージが送信されること", () => {
      // marked モックは <p>text</p> を返すが、linkifyAbsolutePaths が
      // 絶対パスを data-file-path 付きリンクに変換する
      const part = createTextPart("See /home/user/project/src/main.ts for details");
      const { container } = render(<TextPartView part={part} />);
      const link = container.querySelector("a[data-file-path]");
      expect(link).toBeInTheDocument();
      fireEvent.click(link!);
      expect(vi.mocked(postMessage)).toHaveBeenCalledWith({
        type: "openFile",
        filePath: "/home/user/project/src/main.ts",
        line: undefined,
      });
    });

    // sends openFile message with line number when path has :line suffix
    it("行番号付きパスの場合 line が送信されること", () => {
      const part = createTextPart("Error at /home/user/project/src/main.ts:42 found");
      const { container } = render(<TextPartView part={part} />);
      const link = container.querySelector("a[data-file-path]");
      expect(link).toBeInTheDocument();
      fireEvent.click(link!);
      expect(vi.mocked(postMessage)).toHaveBeenCalledWith({
        type: "openFile",
        filePath: "/home/user/project/src/main.ts",
        line: 42,
      });
    });
  });

  // code-block copy button posts only the <pre><code> text, independent of the
  // message-level Copy Markdown action added in copy-chat-markdown.
  context("コードブロックのコピーボタンをクリックした場合", () => {
    // The global Marked mock returns `<p>${text}</p>`, which never emits a
    // `.code-block-wrapper`. For these tests we override the prototype to
    // produce the structure that TextPartView's custom renderer would emit.
    function stubCodeBlockHtml(html: string) {
      return vi.spyOn(Marked.prototype, "parse").mockReturnValueOnce(html);
    }

    // posts the raw <pre><code> text only, not the full Markdown source
    it("コード本文のみを postMessage に送信すること", () => {
      const spy = stubCodeBlockHtml(
        '<div class="code-block-wrapper"><div class="code-block-header"><button class="code-block-copy" type="button" aria-label="Copy code">Copy</button></div><pre><code class="hljs language-ts">const x = 1;</code></pre></div>',
      );
      const part = createTextPart("```ts\nconst x = 1;\n```");
      const { container } = render(<TextPartView part={part} />);
      const copyBtn = container.querySelector<HTMLElement>(".code-block-copy");
      expect(copyBtn).toBeInTheDocument();
      fireEvent.click(copyBtn!);
      expect(vi.mocked(postMessage)).toHaveBeenCalledWith({
        type: "copyToClipboard",
        text: "const x = 1;",
      });
      spy.mockRestore();
    });

    // does not include the code fence or surrounding prose
    it("コードフェンスや前後の文章を含まないこと", () => {
      const spy = stubCodeBlockHtml(
        '<div class="code-block-wrapper"><div class="code-block-header"><button class="code-block-copy" type="button">Copy</button></div><pre><code class="hljs language-py">print("hi")</code></pre></div>',
      );
      const part = createTextPart('Here is code:\n\n```py\nprint("hi")\n```\n\nDone.');
      const { container } = render(<TextPartView part={part} />);
      const copyBtn = container.querySelector<HTMLElement>(".code-block-copy");
      expect(copyBtn).toBeInTheDocument();
      fireEvent.click(copyBtn!);
      const call = vi.mocked(postMessage).mock.calls[0]?.[0];
      expect(call).toEqual({ type: "copyToClipboard", text: 'print("hi")' });
      // フェンスや前後に投稿された場合の文字列が混入していないこと
      expect(call?.text).not.toContain("```");
      expect(call?.text).not.toContain("Here is code");
      expect(call?.text).not.toContain("Done.");
      spy.mockRestore();
    });
  });
});
