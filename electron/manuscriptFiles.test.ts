import path from "node:path";
import { describe, expect, it } from "vitest";
import { importManuscriptFile } from "./manuscriptFiles";
import { createDefaultDocument } from "../src/domain/defaultDocument";
import { plainTextToStoryContent } from "../src/domain/textStory";
import { composeStory } from "../src/layout/pagination";
import { DeterministicTextMeasurer } from "../src/layout/textMeasurement";

function pageCount(text: string): number {
  const document = createDefaultDocument();
  return composeStory({
    storyId: "main-story",
    content: plainTextToStoryContent(text),
    pageSetup: document.pageSetup,
    styles: document.styles,
    measurer: new DeterministicTextMeasurer(),
  }).pages.length;
}

describe("manuscript file import", () => {
  it("K: imports UTF-8 TXT without merging paragraphs", async () => {
    const manuscript = await importManuscriptFile(
      path.resolve("test-fixtures/simple-manuscript.txt"),
    );
    expect(manuscript.format).toBe("txt");
    expect(manuscript.text).toContain("Primeiro parágrafo");
    expect(manuscript.text).toMatch(/manuscrito\.\r?\n\r?\nSegundo/);
    expect(pageCount(manuscript.text)).toBeGreaterThanOrEqual(1);
  });

  it("L: extracts text from a real simple DOCX", async () => {
    const manuscript = await importManuscriptFile(
      path.resolve("node_modules/mammoth/test/test-data/single-paragraph.docx"),
    );
    expect(manuscript.format).toBe("docx");
    expect(manuscript.text.trim().length).toBeGreaterThan(0);
    expect(pageCount(manuscript.text)).toBeGreaterThanOrEqual(1);
  });
});
