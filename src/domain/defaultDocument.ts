
import type { BookDocument, EdgeValues, PageSetup } from "./document";

const defaultMargins: EdgeValues = {
  top: 18,
  bottom: 20,
  inner: 20,
  outer: 15,
};

const defaultBleed: EdgeValues = {
  top: 3,
  bottom: 3,
  inner: 3,
  outer: 3,
};

export const PAGE_PRESETS = {
  A5: { width: 148, height: 210 },
  A4: { width: 210, height: 297 },
} as const;

export function createDefaultPageSetup(): PageSetup {
  return {
    preset: "A5",
    ...PAGE_PRESETS.A5,
    margins: { ...defaultMargins },
    bleed: { ...defaultBleed },
    mirroredMargins: true,
  };
}

export function createDefaultDocument(now = new Date()): BookDocument {
  const timestamp = now.toISOString();
  return {
    schemaVersion: 1,
    id: crypto.randomUUID(),
    title: "Livro sem título",
    createdAt: timestamp,
    updatedAt: timestamp,
    pageSetup: createDefaultPageSetup(),
    viewSettings: {
      showMargins: true,
      showBleed: true,
    },
    pages: [{ id: crypto.randomUUID(), objects: [] }],
    stories: [
      {
        id: "main-story",
        name: "Texto principal",
        content: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              id: crypto.randomUUID(),
              attrs: { styleId: "body" },
              content: [{ type: "text", text: "Comece a escrever seu livro aqui." }],
            },
          ],
        },
      },
    ],
    styles: [
      {
        id: "body",
        name: "Corpo de texto",
        fontFamily: "Georgia",
        fontSizePt: 11,
        lineHeight: 1.35,
        alignment: "justify",
        spaceBeforePt: 0,
        spaceAfterPt: 6,
        firstLineIndentMm: 5,
        leftIndentMm: 0,
        rightIndentMm: 0,
      },
    ],
    numbering: {
      ranges: [
        {
          id: "main-numbering",
          fromPhysicalIndex: 4,
          logicalStart: 1,
          format: "arabic",
        },
      ],
      display: {
        defaultVisible: false,
        logicalRanges: [{ from: 3, to: 180 }],
        hiddenLogicalNumbers: [],
        hiddenPageIds: [],
      },
      placement: {
        vertical: "bottom",
        horizontal: "outer",
        mirrorOnFacingPages: true,
      },
    },
    assets: [],
  };
}
