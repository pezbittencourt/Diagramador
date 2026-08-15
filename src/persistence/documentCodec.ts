import { createDefaultStyles, PAGE_PRESETS } from "../domain/defaultDocument";
import type {
  BookDocument,
  EdgeValues,
  NumberingRange,
  PageNumberFormat,
  PageNumbering,
  PagePreset,
  ParagraphAlignment,
  ParagraphOverrides,
  ParagraphStyle,
  RichTextDocument,
  StoryBlock,
  TextStory,
} from "../domain/document";
import { createEmptyStoryContent } from "../domain/textStory";

const CURRENT_SCHEMA_VERSION = 2;

export function serializeDocument(document: BookDocument): string {
  return JSON.stringify(document, null, 2);
}

function fail(message: string): never {
  throw new Error(`Documento inválido: ${message}`);
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return fail(`“${field}” deve ser um objeto.`);
  }
  return value as Record<string, unknown>;
}

function string(value: unknown, field: string): string {
  if (typeof value !== "string") return fail(`“${field}” deve ser texto.`);
  return value;
}

function number(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fail(`“${field}” deve ser um número finito.`);
  }
  return value;
}

function boolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") return fail(`“${field}” deve ser verdadeiro ou falso.`);
  return value;
}

function nonNegativeInteger(value: unknown, field: string): number {
  const parsed = number(value, field);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return fail(`“${field}” deve ser um inteiro não negativo.`);
  }
  return parsed;
}

function array(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) return fail(`“${field}” deve ser uma lista.`);
  return value;
}

function edges(value: unknown, field: string): EdgeValues {
  const source = record(value, field);
  return {
    top: number(source.top, `${field}.top`),
    bottom: number(source.bottom, `${field}.bottom`),
    inner: number(source.inner, `${field}.inner`),
    outer: number(source.outer, `${field}.outer`),
  };
}

function inferPreset(width: number, height: number): PagePreset {
  const preset = Object.entries(PAGE_PRESETS).find(
    ([, size]) => size.width === width && size.height === height,
  );
  return (preset?.[0] as PagePreset | undefined) ?? "custom";
}

function parseParagraphOverrides(value: unknown, field: string): ParagraphOverrides | undefined {
  if (value === undefined) return undefined;
  const source = record(value, field);
  const overrides: ParagraphOverrides = {};
  if (source.fontFamily !== undefined) overrides.fontFamily = string(source.fontFamily, `${field}.fontFamily`);
  if (source.fontSizePt !== undefined) overrides.fontSizePt = number(source.fontSizePt, `${field}.fontSizePt`);
  if (source.fontWeight !== undefined) overrides.fontWeight = number(source.fontWeight, `${field}.fontWeight`);
  if (source.italic !== undefined) overrides.italic = boolean(source.italic, `${field}.italic`);
  if (source.underline !== undefined) overrides.underline = boolean(source.underline, `${field}.underline`);
  if (source.color !== undefined) overrides.color = string(source.color, `${field}.color`);
  if (source.lineHeight !== undefined) overrides.lineHeight = number(source.lineHeight, `${field}.lineHeight`);
  if (source.alignment !== undefined) {
    if (!( ["left", "center", "right", "justify"] as unknown[]).includes(source.alignment)) {
      return fail(`alinhamento desconhecido em “${field}.alignment”.`);
    }
    overrides.alignment = source.alignment as ParagraphAlignment;
  }
  if (source.spaceBeforePt !== undefined) overrides.spaceBeforePt = number(source.spaceBeforePt, `${field}.spaceBeforePt`);
  if (source.spaceAfterPt !== undefined) overrides.spaceAfterPt = number(source.spaceAfterPt, `${field}.spaceAfterPt`);
  if (source.firstLineIndentMm !== undefined) overrides.firstLineIndentMm = number(source.firstLineIndentMm, `${field}.firstLineIndentMm`);
  if (source.leftIndentMm !== undefined) overrides.leftIndentMm = number(source.leftIndentMm, `${field}.leftIndentMm`);
  if (source.rightIndentMm !== undefined) overrides.rightIndentMm = number(source.rightIndentMm, `${field}.rightIndentMm`);
  return Object.keys(overrides).length ? overrides : undefined;
}

function parseStyles(value: unknown): ParagraphStyle[] {
  const defaults = createDefaultStyles();
  const defaultBody = defaults[0];
  const parsed = array(value ?? [], "styles").map((item, index) => {
    const source = record(item, `styles[${index}]`);
    const id = string(source.id, `styles[${index}].id`);
    const fallback = defaults.find((style) => style.id === id) ?? {
      ...defaultBody,
      id,
      name: typeof source.name === "string" ? source.name : id,
    };
    const alignment = source.alignment ?? fallback.alignment;
    if (!( ["left", "center", "right", "justify"] as unknown[]).includes(alignment)) {
      return fail(`alinhamento desconhecido em “styles[${index}]”.`);
    }
    return {
      id,
      name: typeof source.name === "string" ? source.name : fallback.name,
      fontFamily: typeof source.fontFamily === "string" ? source.fontFamily : fallback.fontFamily,
      fontSizePt: source.fontSizePt === undefined ? fallback.fontSizePt : number(source.fontSizePt, `styles[${index}].fontSizePt`),
      fontWeight: source.fontWeight === undefined ? fallback.fontWeight : number(source.fontWeight, `styles[${index}].fontWeight`),
      italic: source.italic === undefined ? fallback.italic : boolean(source.italic, `styles[${index}].italic`),
      underline: source.underline === undefined ? fallback.underline : boolean(source.underline, `styles[${index}].underline`),
      color: source.color === undefined ? fallback.color : string(source.color, `styles[${index}].color`),
      lineHeight: source.lineHeight === undefined ? fallback.lineHeight : number(source.lineHeight, `styles[${index}].lineHeight`),
      alignment: alignment as ParagraphAlignment,
      spaceBeforePt: source.spaceBeforePt === undefined ? fallback.spaceBeforePt : number(source.spaceBeforePt, `styles[${index}].spaceBeforePt`),
      spaceAfterPt: source.spaceAfterPt === undefined ? fallback.spaceAfterPt : number(source.spaceAfterPt, `styles[${index}].spaceAfterPt`),
      firstLineIndentMm: source.firstLineIndentMm === undefined ? fallback.firstLineIndentMm : number(source.firstLineIndentMm, `styles[${index}].firstLineIndentMm`),
      leftIndentMm: source.leftIndentMm === undefined ? fallback.leftIndentMm : number(source.leftIndentMm, `styles[${index}].leftIndentMm`),
      rightIndentMm: source.rightIndentMm === undefined ? fallback.rightIndentMm : number(source.rightIndentMm, `styles[${index}].rightIndentMm`),
    } satisfies ParagraphStyle;
  });
  const ids = new Set(parsed.map((style) => style.id));
  return [...parsed, ...defaults.filter((style) => !ids.has(style.id))];
}

function parseStoryContent(value: unknown, field: string): RichTextDocument {
  const source = record(value, field);
  if (source.type !== "doc") return fail(`“${field}.type” deve ser “doc”.`);
  const blocks = array(source.content ?? [], `${field}.content`).map((item, index) => {
    const block = record(item, `${field}.content[${index}]`);
    const id = typeof block.id === "string" && block.id ? block.id : crypto.randomUUID();
    if (block.type === "pageBreak") return { type: "pageBreak", id } satisfies StoryBlock;
    if (block.type !== "paragraph") {
      return fail(`bloco desconhecido em “${field}.content[${index}]”.`);
    }
    const attrs = block.attrs === undefined ? {} : record(block.attrs, `${field}.content[${index}].attrs`);
    const inlineContent = array(block.content ?? [], `${field}.content[${index}].content`).map(
      (node, inlineIndex) => {
        const inline = record(node, `${field}.content[${index}].content[${inlineIndex}]`);
        if (inline.type !== "text") {
          return fail(`elemento inline desconhecido em “${field}.content[${index}]”.`);
        }
        const marks = inline.marks === undefined
          ? undefined
          : array(inline.marks, "marks").map((mark, markIndex) => {
              const parsedMark = record(mark, `marks[${markIndex}]`);
              const attrs = parsedMark.attrs === undefined
                ? undefined
                : record(parsedMark.attrs, `marks[${markIndex}].attrs`);
              const value = attrs?.value;
              if (value !== undefined && !["string", "number", "boolean"].includes(typeof value)) {
                return fail(`valor de marca inválido em “marks[${markIndex}]”.`);
              }
              return {
                type: string(parsedMark.type, `marks[${markIndex}].type`),
                ...(value === undefined ? {} : { attrs: { value: value as string | number | boolean } }),
              };
            });
        return {
          type: "text" as const,
          text: string(inline.text ?? "", "text"),
          ...(marks ? { marks } : {}),
        };
      },
    );
    return {
      type: "paragraph",
      id,
      attrs: {
        styleId: typeof attrs.styleId === "string" ? attrs.styleId : "body",
        ...(() => {
          const overrides = parseParagraphOverrides(
            attrs.overrides,
            `${field}.content[${index}].attrs.overrides`,
          );
          return overrides ? { overrides } : {};
        })(),
      },
      content: inlineContent,
    } satisfies StoryBlock;
  });
  return blocks.length ? { type: "doc", content: blocks } : createEmptyStoryContent();
}

function parseStories(value: unknown): TextStory[] {
  const stories = array(value ?? [], "stories").map((item, index) => {
    const story = record(item, `stories[${index}]`);
    return {
      id: string(story.id, `stories[${index}].id`),
      name: string(story.name, `stories[${index}].name`),
      content: parseStoryContent(story.content, `stories[${index}].content`),
    };
  });
  return stories.length ? stories : [{
    id: "main-story",
    name: "Texto principal",
    content: createEmptyStoryContent(),
  }];
}

function parseNumbering(value: unknown): PageNumbering {
  const source = record(value, "numbering");
  const ranges = array(source.ranges, "numbering.ranges").map((item, index) => {
    const range = record(item, `numbering.ranges[${index}]`);
    const format = range.format;
    if (!(["arabic", "roman-lower", "roman-upper"] as unknown[]).includes(format)) {
      return fail(`formato de numeração desconhecido em “numbering.ranges[${index}]”.`);
    }
    const parsed: NumberingRange = {
      id: string(range.id, `numbering.ranges[${index}].id`),
      fromPhysicalIndex: nonNegativeInteger(
        range.fromPhysicalIndex,
        `numbering.ranges[${index}].fromPhysicalIndex`,
      ),
      logicalStart: number(range.logicalStart, `numbering.ranges[${index}].logicalStart`),
      format: format as PageNumberFormat,
    };
    if (range.toPhysicalIndex !== undefined) {
      parsed.toPhysicalIndex = nonNegativeInteger(
        range.toPhysicalIndex,
        `numbering.ranges[${index}].toPhysicalIndex`,
      );
    }
    if (range.prefix !== undefined) parsed.prefix = string(range.prefix, "prefix");
    if (range.suffix !== undefined) parsed.suffix = string(range.suffix, "suffix");
    return parsed;
  });

  const display = record(source.display, "numbering.display");
  const logicalRanges = array(
    display.logicalRanges,
    "numbering.display.logicalRanges",
  ).map((item, index) => {
    const range = record(item, `numbering.display.logicalRanges[${index}]`);
    const parsed: { from: number; to?: number } = {
      from: number(range.from, `numbering.display.logicalRanges[${index}].from`),
    };
    if (range.to !== undefined) {
      parsed.to = number(range.to, `numbering.display.logicalRanges[${index}].to`);
    }
    return parsed;
  });

  const placement = record(source.placement, "numbering.placement");
  if (placement.vertical !== "top" && placement.vertical !== "bottom") {
    return fail("posição vertical de numeração desconhecida.");
  }
  if (!(["inner", "outer", "center"] as unknown[]).includes(placement.horizontal)) {
    return fail("posição horizontal de numeração desconhecida.");
  }

  return {
    ranges,
    display: {
      defaultVisible:
        typeof display.defaultVisible === "boolean" ? display.defaultVisible : false,
      logicalRanges,
      hiddenLogicalNumbers: (display.hiddenLogicalNumbers === undefined
        ? []
        : array(display.hiddenLogicalNumbers, "numbering.display.hiddenLogicalNumbers")
      ).map((item, index) =>
        nonNegativeInteger(item, `numbering.display.hiddenLogicalNumbers[${index}]`),
      ),
      hiddenPageIds: array(
        display.hiddenPageIds ?? [],
        "numbering.display.hiddenPageIds",
      ).map((item, index) => string(item, `numbering.display.hiddenPageIds[${index}]`)),
    },
    placement: {
      vertical: placement.vertical,
      horizontal: placement.horizontal as PageNumbering["placement"]["horizontal"],
      mirrorOnFacingPages:
        typeof placement.mirrorOnFacingPages === "boolean"
          ? placement.mirrorOnFacingPages
          : true,
    },
  };
}

export function parseDocument(source: string): BookDocument {
  let candidate: unknown;
  try {
    candidate = JSON.parse(source);
  } catch {
    return fail("o arquivo não contém JSON válido.");
  }

  const document = record(candidate, "raiz");
  if (document.schemaVersion !== 1 && document.schemaVersion !== CURRENT_SCHEMA_VERSION) {
    throw new Error(
      `Versão de documento incompatível. Esperada: ${CURRENT_SCHEMA_VERSION}; encontrada: ${String(document.schemaVersion)}.`,
    );
  }

  const setup = record(document.pageSetup, "pageSetup");
  const width = number(setup.width, "pageSetup.width");
  const height = number(setup.height, "pageSetup.height");
  const preset = setup.preset;
  const parsedPreset = preset === "A4" || preset === "A5" || preset === "custom"
    ? preset
    : inferPreset(width, height);
  const view = document.viewSettings === undefined
    ? { showMargins: true, showBleed: true }
    : record(document.viewSettings, "viewSettings");

  return {
    schemaVersion: 2,
    id: string(document.id, "id"),
    title: string(document.title, "title"),
    createdAt: string(document.createdAt, "createdAt"),
    updatedAt: string(document.updatedAt, "updatedAt"),
    pageSetup: {
      preset: parsedPreset,
      width,
      height,
      margins: edges(setup.margins, "pageSetup.margins"),
      bleed: edges(setup.bleed, "pageSetup.bleed"),
      mirroredMargins:
        typeof setup.mirroredMargins === "boolean"
          ? setup.mirroredMargins
          : fail("“pageSetup.mirroredMargins” deve ser verdadeiro ou falso."),
    },
    viewSettings: {
      showMargins:
        typeof view.showMargins === "boolean" ? view.showMargins : true,
      showBleed: typeof view.showBleed === "boolean" ? view.showBleed : true,
    },
    pages: array(document.pages, "pages") as BookDocument["pages"],
    stories: parseStories(document.stories),
    styles: parseStyles(document.styles),
    numbering: parseNumbering(document.numbering),
    assets: array(document.assets, "assets") as BookDocument["assets"],
  };
}
