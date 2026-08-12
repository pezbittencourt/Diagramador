import { describe, expect, it } from "vitest";
import {
  PAGE_BREAK_CHARACTER,
  deleteFromStory,
  normalizeImportedText,
  plainTextToStoryContent,
  replaceStoryRange,
  storyToPlainText,
} from "./textStory";

describe("continuous text story", () => {
  it("K: normalizes TXT line endings and preserves paragraphs", () => {
    const normalized = normalizeImportedText("Primeiro\r\n\r\nSegundo\rTerceiro");
    const content = plainTextToStoryContent(normalized);
    expect(storyToPlainText(content)).toBe("Primeiro\n\nSegundo\nTerceiro");
    expect(content.content.filter((block) => block.type === "paragraph")).toHaveLength(4);
  });

  it("inserts and deletes around a semantic selection", () => {
    const content = plainTextToStoryContent("abc\ndef");
    const inserted = replaceStoryRange(content, { anchor: 1, head: 5 }, "XYZ");
    expect(storyToPlainText(inserted.content)).toBe("aXYZef");
    expect(inserted.selection).toEqual({ anchor: 4, head: 4 });
    const deleted = deleteFromStory(inserted.content, inserted.selection, "backward");
    expect(storyToPlainText(deleted.content)).toBe("aXYef");
  });

  it("keeps manual page breaks as semantic blocks", () => {
    const content = plainTextToStoryContent(`a${PAGE_BREAK_CHARACTER}b`);
    expect(content.content.some((block) => block.type === "pageBreak")).toBe(true);
    expect(storyToPlainText(content)).toBe(`a${PAGE_BREAK_CHARACTER}b`);
  });
});
