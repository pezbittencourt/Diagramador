
import type { BookDocument, EdgeValues, PageSetup, ParagraphStyle } from "./document";

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

export function createDefaultStyles(): ParagraphStyle[] {
  const body: ParagraphStyle = {
    id: "body",
    name: "Corpo de texto",
    fontFamily: "Georgia",
    fontSizePt: 11,
    fontWeight: 400,
    italic: false,
    underline: false,
    color: "#222520",
    lineHeight: 1.35,
    alignment: "justify",
    spaceBeforePt: 0,
    spaceAfterPt: 6,
    firstLineIndentMm: 5,
    leftIndentMm: 0,
    rightIndentMm: 0,
  };
  return [
    body,
    {
      ...body,
      id: "chapter-title",
      name: "Título de capítulo",
      fontSizePt: 20,
      fontWeight: 700,
      alignment: "center",
      lineHeight: 1.15,
      spaceBeforePt: 28,
      spaceAfterPt: 20,
      firstLineIndentMm: 0,
    },
    {
      ...body,
      id: "subtitle",
      name: "Subtítulo",
      fontSizePt: 14,
      fontWeight: 700,
      alignment: "left",
      lineHeight: 1.2,
      spaceBeforePt: 14,
      spaceAfterPt: 8,
      firstLineIndentMm: 0,
    },
    {
      ...body,
      id: "quote",
      name: "Citação",
      fontSizePt: 10.5,
      italic: true,
      lineHeight: 1.4,
      firstLineIndentMm: 0,
      leftIndentMm: 10,
      rightIndentMm: 10,
      spaceBeforePt: 8,
      spaceAfterPt: 8,
    },
    {
      ...body,
      id: "dedication",
      name: "Dedicatória",
      italic: true,
      alignment: "center",
      lineHeight: 1.5,
      firstLineIndentMm: 0,
      leftIndentMm: 12,
      rightIndentMm: 12,
      spaceBeforePt: 40,
      spaceAfterPt: 12,
    },
  ];
}

export function createDefaultDocument(now = new Date()): BookDocument {
  const timestamp = now.toISOString();
  return {
    schemaVersion: 3,
    id: crypto.randomUUID(),
    title: "Livro sem título",
    createdAt: timestamp,
    updatedAt: timestamp,
    pageSetup: createDefaultPageSetup(),
    viewSettings: {
      showMargins: true,
      showBleed: true,
      showRulers: true,
      showCustomGuides: true,
      snapEnabled: true,
      viewMode: "spread",
    },
    guides: [],
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

    styles: createDefaultStyles(),
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
