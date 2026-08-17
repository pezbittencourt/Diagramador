import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type ClipboardEvent as ReactClipboardEvent,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import type { ParagraphStyle, RichTextDocument, RichTextMark } from "../domain/document";
import {
  PAGE_BREAK_CHARACTER,
  applyInlineFormat,
  applyParagraphFormat,
  applyParagraphStyle,
  deleteFromStory,
  marksAtOffset,
  replaceStoryRange,
  selectionFormatting,
  storyToPlainText,
  type SelectionFormatting,
  type StoryEditResult,
  type StorySelection,
} from "../domain/textStory";
import { setMark, type InlineMarkType } from "../domain/textFormatting";
import type { EditorCommand } from "./editorCommands";

interface StoryEditorProps {
  content: RichTextDocument;
  styles: ParagraphStyle[];
  children: ReactNode;
  onChange: (content: RichTextDocument) => void;
  onSelectionFormattingChange: (formatting: SelectionFormatting) => void;
  pageBreakRequest: number;
  command?: EditorCommand;
  onRevealOffset?: (offset: number) => void;
}

interface HistoryEntry {
  content: RichTextDocument;
  selection: StorySelection;
}

function fragmentElement(node: Node | null): HTMLElement | null {
  const element = node instanceof HTMLElement ? node : node?.parentElement;
  return element?.closest<HTMLElement>("[data-story-from], [data-line-hit-from]") ?? null;
}

function domPointToOffset(node: Node | null, offset: number): number | null {
  const fragment = fragmentElement(node);
  if (!fragment) return null;
  const from = Number(fragment.dataset.storyFrom ?? fragment.dataset.lineHitFrom);
  const to = Number(fragment.dataset.storyTo ?? fragment.dataset.lineHitTo);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  const localOffset = node?.nodeType === Node.TEXT_NODE
    ? offset
    : fragment.dataset.lineHitFrom !== undefined && offset > 0
      ? to - from
      : 0;
  return Math.min(to, from + Math.max(0, localOffset));
}

function readDomSelection(root: HTMLElement): StorySelection | null {
  const selection = window.getSelection();
  if (!selection?.anchorNode || !selection.focusNode) return null;
  if (!root.contains(selection.anchorNode) || !root.contains(selection.focusNode)) return null;
  const anchor = domPointToOffset(selection.anchorNode, selection.anchorOffset);
  const head = domPointToOffset(selection.focusNode, selection.focusOffset);
  return anchor === null || head === null ? null : { anchor, head };
}

function findDomPoint(root: HTMLElement, offset: number): [Node, number] | null {
  const fragments = [...root.querySelectorAll<HTMLElement>("[data-story-from]")];
  if (!fragments.length) return null;
  const firstFrom = Number(fragments[0].dataset.storyFrom);
  const lastTo = Number(fragments.at(-1)?.dataset.storyTo);
  if (!Number.isFinite(firstFrom) || !Number.isFinite(lastTo)
      || offset < firstFrom || offset > lastTo) return null;
  let endBoundary: [Node, number] | null = null;
  for (const fragment of fragments) {
    const from = Number(fragment.dataset.storyFrom);
    const to = Number(fragment.dataset.storyTo);
    const textNode = fragment.firstChild ?? fragment;
    const sourceLength = Math.max(0, to - from);
    if (offset === from) return [textNode, 0];
    if (offset > from && offset < to) {
      return [textNode, Math.min(sourceLength, Math.max(0, offset - from))];
    }
    if (offset === to) endBoundary = [textNode, sourceLength];
    if (from > offset) break;
  }
  return endBoundary;
}

export function StoryEditor({
  content,
  styles,
  children,
  onChange,
  onSelectionFormattingChange,
  pageBreakRequest,
  command,
  onRevealOffset,
}: StoryEditorProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const selectionRef = useRef<StorySelection>({ anchor: 0, head: 0 });
  const typingMarksRef = useRef<RichTextMark[]>([]);
  const pendingSelectionRef = useRef<StorySelection | undefined>(undefined);
  const undoStackRef = useRef<HistoryEntry[]>([]);
  const redoStackRef = useRef<HistoryEntry[]>([]);
  const lastEmittedRef = useRef<RichTextDocument | undefined>(undefined);
  const lastBreakRequestRef = useRef(pageBreakRequest);
  const lastCommandRef = useRef(0);

  const refreshFormatting = useCallback(() => {
    onSelectionFormattingChange(selectionFormatting(
      content,
      styles,
      selectionRef.current,
      typingMarksRef.current,
    ));
  }, [content, onSelectionFormattingChange, styles]);

  useEffect(() => {
    if (lastEmittedRef.current === content) return;
    undoStackRef.current = [];
    redoStackRef.current = [];
    selectionRef.current = { anchor: 0, head: 0 };
    typingMarksRef.current = marksAtOffset(content, 0);
  }, [content]);

  const rememberSelection = useCallback(() => {
    if (pendingSelectionRef.current) return;
    const root = rootRef.current;
    if (!root) return;
    const selection = readDomSelection(root);
    if (!selection) return;
    const previous = selectionRef.current;
    const changed = previous.anchor !== selection.anchor || previous.head !== selection.head;
    selectionRef.current = selection;
    if (changed && selection.anchor === selection.head) {
      typingMarksRef.current = marksAtOffset(content, selection.head);
    }
    refreshFormatting();
  }, [content, refreshFormatting]);

  useEffect(() => {
    document.addEventListener("selectionchange", rememberSelection);
    return () => document.removeEventListener("selectionchange", rememberSelection);
  }, [rememberSelection]);

  useEffect(() => refreshFormatting(), [refreshFormatting]);

  useLayoutEffect(() => {
    const pending = pendingSelectionRef.current;
    const root = rootRef.current;
    if (!pending || !root) return;
    const anchor = findDomPoint(root, pending.anchor);
    const head = findDomPoint(root, pending.head);
    if (!anchor || !head) {
      onRevealOffset?.(pending.head);
      return;
    }
    pendingSelectionRef.current = undefined;
    window.getSelection()?.setBaseAndExtent(anchor[0], anchor[1], head[0], head[1]);
    root.focus({ preventScroll: true });
  }, [content, children, onRevealOffset]);

  const emit = useCallback((result: StoryEditResult, addToHistory = true) => {
    if (addToHistory) {
      undoStackRef.current.push({ content, selection: selectionRef.current });
      if (undoStackRef.current.length > 200) undoStackRef.current.shift();
    }
    redoStackRef.current = [];
    selectionRef.current = result.selection;
    pendingSelectionRef.current = result.selection;
    lastEmittedRef.current = result.content;
    onChange(result.content);
  }, [content, onChange]);

  const undo = useCallback(() => {
    const previous = undoStackRef.current.pop();
    if (!previous) return;
    redoStackRef.current.push({ content, selection: selectionRef.current });
    selectionRef.current = previous.selection;
    pendingSelectionRef.current = previous.selection;
    typingMarksRef.current = marksAtOffset(previous.content, previous.selection.head);
    lastEmittedRef.current = previous.content;
    onChange(previous.content);
  }, [content, onChange]);

  const redo = useCallback(() => {
    const next = redoStackRef.current.pop();
    if (!next) return;
    undoStackRef.current.push({ content, selection: selectionRef.current });
    selectionRef.current = next.selection;
    pendingSelectionRef.current = next.selection;
    typingMarksRef.current = marksAtOffset(next.content, next.selection.head);
    lastEmittedRef.current = next.content;
    onChange(next.content);
  }, [content, onChange]);

  const insert = useCallback((text: string) => {
    rememberSelection();
    emit(replaceStoryRange(content, selectionRef.current, text, typingMarksRef.current));
  }, [content, emit, rememberSelection]);

  const formatInline = useCallback((
    mark: InlineMarkType,
    value: string | number | boolean,
  ) => {
    rememberSelection();
    const selection = selectionRef.current;
    if (selection.anchor === selection.head) {
      typingMarksRef.current = setMark(typingMarksRef.current, mark, value);
      refreshFormatting();
      rootRef.current?.focus({ preventScroll: true });
      return;
    }
    const next = applyInlineFormat(content, selection, mark, value);
    emit({ content: next, selection });
  }, [content, emit, refreshFormatting, rememberSelection]);

  useEffect(() => {
    if (pageBreakRequest === lastBreakRequestRef.current) return;
    lastBreakRequestRef.current = pageBreakRequest;
    insert(PAGE_BREAK_CHARACTER);
  }, [insert, pageBreakRequest]);

  useEffect(() => {
    if (!command || command.id === lastCommandRef.current) return;
    lastCommandRef.current = command.id;
    if (command.type === "inline") {
      formatInline(command.mark, command.value);
    } else if (command.type === "style") {
      rememberSelection();
      const selection = selectionRef.current;
      emit({ content: applyParagraphStyle(content, selection, command.styleId), selection });
    } else {
      rememberSelection();
      const selection = selectionRef.current;
      emit({
        content: applyParagraphFormat(content, selection, command.property, command.value),
        selection,
      });
    }
  }, [command, content, emit, formatInline, rememberSelection]);

  const onBeforeInput = (event: FormEvent<HTMLDivElement>) => {
    const input = event.nativeEvent as InputEvent;
    if (input.inputType === "insertText" || input.inputType === "insertCompositionText") {
      event.preventDefault();
      insert(input.data ?? "");
    } else if (input.inputType === "insertParagraph" || input.inputType === "insertLineBreak") {
      event.preventDefault();
      insert("\n");
    } else if (input.inputType === "deleteContentBackward") {
      event.preventDefault();
      rememberSelection();
      emit(deleteFromStory(content, selectionRef.current, "backward"));
    } else if (input.inputType === "deleteContentForward" || input.inputType === "deleteByCut") {
      event.preventDefault();
      rememberSelection();
      emit(deleteFromStory(content, selectionRef.current, "forward"));
    } else if (input.inputType === "historyUndo") {
      event.preventDefault();
      undo();
    } else if (input.inputType === "historyRedo") {
      event.preventDefault();
      redo();
    }
  };

  const selectedText = () => {
    rememberSelection();
    const text = storyToPlainText(content);
    const from = Math.min(selectionRef.current.anchor, selectionRef.current.head);
    const to = Math.max(selectionRef.current.anchor, selectionRef.current.head);
    return text.slice(from, to).replaceAll(PAGE_BREAK_CHARACTER, "\n\n");
  };

  const onCopy = (event: ReactClipboardEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.clipboardData.setData("text/plain", selectedText());
  };

  const onCut = (event: ReactClipboardEvent<HTMLDivElement>) => {
    onCopy(event);
    emit(replaceStoryRange(content, selectionRef.current, ""));
  };

  const onPaste = (event: ReactClipboardEvent<HTMLDivElement>) => {
    event.preventDefault();
    insert(event.clipboardData.getData("text/plain"));
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const modifier = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    if (modifier && event.key === "Enter") {
      event.preventDefault();
      insert(PAGE_BREAK_CHARACTER);
    } else if (modifier && key === "a") {
      event.preventDefault();
      const length = storyToPlainText(content).length;
      const selection = { anchor: 0, head: length };
      selectionRef.current = selection;
      pendingSelectionRef.current = selection;
      const root = rootRef.current;
      const anchor = root && findDomPoint(root, 0);
      const head = root && findDomPoint(root, length);
      if (anchor && head) window.getSelection()?.setBaseAndExtent(anchor[0], anchor[1], head[0], head[1]);
    } else if (modifier && (key === "b" || key === "i" || key === "u")) {
      event.preventDefault();
      const current = selectionFormatting(content, styles, selectionRef.current, typingMarksRef.current);
      if (key === "b") formatInline("bold", !(current.fontWeight !== null && current.fontWeight >= 600));
      else if (key === "i") formatInline("italic", current.italic !== true);
      else formatInline("underline", current.underline !== true);
    } else if (modifier && key === "z") {
      event.preventDefault();
      event.shiftKey ? redo() : undo();
    } else if (modifier && key === "y") {
      event.preventDefault();
      redo();
    }
  };

  return (
    <div
      ref={rootRef}
      className="story-editor"
      contentEditable
      suppressContentEditableWarning
      spellCheck
      aria-label="Texto principal do livro"
      onBeforeInput={onBeforeInput}
      onCopy={onCopy}
      onCut={onCut}
      onPaste={onPaste}
      onKeyDown={onKeyDown}
    >
      {children}
    </div>
  );
}
