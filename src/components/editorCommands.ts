import type { ParagraphFormatProperty } from "../domain/textStory";
import type { InlineMarkType } from "../domain/textFormatting";
import type { ParagraphAlignment } from "../domain/document";

export type EditorCommand =
  | {
      id: number;
      type: "inline";
      mark: InlineMarkType;
      value: string | number | boolean;
    }
  | {
      id: number;
      type: "paragraph";
      property: ParagraphFormatProperty;
      value: ParagraphAlignment | number;
    }
  | { id: number; type: "style"; styleId: string };

export type EditorCommandRequest = EditorCommand extends infer Command
  ? Command extends { id: number }
    ? Omit<Command, "id">
    : never
  : never;
