import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ModelSelector } from "../../../components/molecules/ModelSelector";
import { createProvider } from "../../factories";

const defaultProps = {
  providers: [
    createProvider("openai", {
      "gpt-4": { id: "gpt-4", name: "GPT-4", limit: { context: 128000, output: 4096 } },
    }),
  ],
  allProvidersData: null,
  selectedModel: { providerID: "openai", modelID: "gpt-4" },
  onSelect: vi.fn(),
};

describe("ModelSelector", () => {
  // when rendered
  context("レンダリングした場合", () => {
    // renders the selector button
    it("セレクターボタンをレンダリングすること", () => {
      const { container } = render(<ModelSelector {...defaultProps} />);
      expect(container.querySelector(".button")).toBeInTheDocument();
    });

    // shows selected model name
    it("選択中のモデル名を表示すること", () => {
      const { container } = render(<ModelSelector {...defaultProps} />);
      expect(container.querySelector(".label")?.textContent).toBe("GPT-4");
    });
  });

  // effort display
  // task 2.2: "Display explicit effort compactly next to the selected model
  // label while showing no effort text when the state is unset".
  context("explicit effort が指定された場合", () => {
    // explicit effort with a label is rendered with the separator
    it("effort label がモデル名の隣に区切り文字付きで表示されること", () => {
      const { container } = render(
        <ModelSelector {...defaultProps} selectedModelEffort={{ id: "low", label: "Low" }} />,
      );
      const label = container.querySelector(".label");
      expect(label).toBeInTheDocument();
      // 区切り文字と effort ラベルが表示される
      expect(container.querySelector(".separator")).toBeInTheDocument();
      expect(container.querySelector(".effort")?.textContent).toBe("Low");
      // 中黒で区切られて結合される (visual spacing は CSS margin で確保)
      expect(label?.textContent).toBe("GPT-4·Low");
    });

    // explicit effort without a label falls back to the id
    it("label が無い場合は id が表示されること", () => {
      const { container } = render(<ModelSelector {...defaultProps} selectedModelEffort={{ id: "minimal" }} />);
      expect(container.querySelector(".effort")?.textContent).toBe("minimal");
      expect(container.querySelector(".label")?.textContent).toBe("GPT-4·minimal");
    });
  });

  // when effort is unset — must not show any effort text or separator
  // "Preserve default effort until explicitly selected" requirement.
  context("effort が未設定の場合", () => {
    it("effort テキストや区切り文字が表示されないこと", () => {
      const { container } = render(<ModelSelector {...defaultProps} />);
      expect(container.querySelector(".separator")).toBeNull();
      expect(container.querySelector(".effort")).toBeNull();
      // モデル名だけが表示される
      expect(container.querySelector(".modelName")?.textContent).toBe("GPT-4");
    });

    it("selectedModelEffort が undefined でも同様であること", () => {
      const { container } = render(<ModelSelector {...defaultProps} selectedModelEffort={undefined} />);
      expect(container.querySelector(".separator")).toBeNull();
      expect(container.querySelector(".effort")).toBeNull();
      expect(container.querySelector(".label")?.textContent).toBe("GPT-4");
    });
  });

  // when button is clicked
  context("ボタンをクリックした場合", () => {
    // opens the model panel
    it("モデルパネルを開くこと", () => {
      const { container } = render(<ModelSelector {...defaultProps} />);
      fireEvent.click(container.querySelector(".button")!);
      expect(container.querySelector(".panel")).toBeInTheDocument();
    });
  });

  // when a model is selected
  context("モデルを選択した場合", () => {
    // calls onSelect with the model
    it("onSelect が呼ばれること", () => {
      const onSelect = vi.fn();
      const { container } = render(<ModelSelector {...defaultProps} onSelect={onSelect} />);
      fireEvent.click(container.querySelector(".button")!);
      fireEvent.click(container.querySelector(".item")!);
      expect(onSelect).toHaveBeenCalledWith({ providerID: "openai", modelID: "gpt-4" });
    });
  });

  // when no model is selected
  context("モデルが未選択の場合", () => {
    // shows placeholder text
    it("プレースホルダーテキストを表示すること", () => {
      const { container } = render(<ModelSelector {...defaultProps} selectedModel={null} />);
      expect(container.querySelector(".label")?.textContent).toBeTruthy();
    });

    // effort must not leak into the placeholder even when set
    it("effort テキストや区切り文字が表示されないこと", () => {
      const { container } = render(
        <ModelSelector {...defaultProps} selectedModel={null} selectedModelEffort={{ id: "low", label: "Low" }} />,
      );
      expect(container.querySelector(".separator")).toBeNull();
      expect(container.querySelector(".effort")).toBeNull();
      // プレースホルダーのみ表示される
      expect(container.querySelector(".modelName")?.textContent?.trim()).toBeTruthy();
    });
  });
});
