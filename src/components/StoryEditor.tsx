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
import type { RichTextDocument } from "../domain/document";
import {
  PAGE_BREAK_CHARACTER,
  deleteFromStory,
  replaceStoryRange,
  storyToPlainText,
  type StoryEditResult,
  type StorySelection,
} from "../domain/textStory";

interface StoryEditorProps {
  content: RichTextDocument;
  children: ReactNode;
  onChange: (content: RichTextDocument) => void;
  pageBreakRequest: number;
}

function fragmentElement(node: Node | null): HTMLElement | null {
  const element = node instanceof HTMLElement ? node : node?.parentElement;
  return element?.closest<HTMLElement>("[data-story-from]") ?? null;
}

function domPointToOffset(node: Node | null, offset: number): number | null {
  const fragment = fragmentElement(node);
  if (!fragment) return null;
  const from = Number(fragment.dataset.storyFrom);
  const to = Number(fragment.dataset.storyTo);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  const localOffset = node?.nodeType === Node.TEXT_NODE ? offset : 0;
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
  const fragments = root.querySelectorAll<HTMLElement>("[data-story-from]");
  let fallback: [Node, number] | null = null;
  for (const fragment of fragments) {
    const from = Number(fragment.dataset.storyFrom);
    const to = Number(fragment.dataset.storyTo);
    const textNode = fragment.firstChild ?? fragment;
    const sourceLength = Math.max(0, to - from);
    fallback = [textNode, sourceLength];
    if (offset >= from && offset <= to) {
      return [textNode, Math.min(sourceLength, Math.max(0, offset - from))];
    }
  }
  return fallback;
}

export function StoryEditor({
  content,
  children,
  onChange,
  pageBreakRequest,
}: StoryEditorProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const selectionRef = useRef<StorySelection>({ anchor: 0, head: 0 });
  const pendingSelectionRef = useRef<StorySelection | undefined>(undefined);
  const undoStackRef = useRef<RichTextDocument[]>([]);
  const redoStackRef = useRef<RichTextDocument[]>([]);
  const lastEmittedRef = useRef<RichTextDocument | undefined>(undefined);
  const lastBreakRequestRef = useRef(pageBreakRequest);

  useEffect(() => {
    if (lastEmittedRef.current === content) return;
    undoStackRef.current = [];
    redoStackRef.current = [];
    selectionRef.current = { anchor: 0, head: 0 };
  }, [content]);

  const rememberSelection = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    const selection = readDomSelection(root);
    if (selection) selectionRef.current = selection;
  }, []);

  useEffect(() => {
    document.addEventListener("selectionchange", rememberSelection);
    return () => document.removeEventListener("selectionchange", rememberSelection);
  }, [rememberSelection]);

  useLayoutEffect(() => {
    const pending = pendingSelectionRef.current;
    const root = rootRef.current;
    if (!pending || !root) return;
    const anchor = findDomPoint(root, pending.anchor);
    const head = findDomPoint(root, pending.head);
    if (!anchor || !head) return;
    const selection = window.getSelection();
    selection?.setBaseAndExtent(anchor[0], anchor[1], head[0], head[1]);
    pendingSelectionRef.current = undefined;
    root.focus({ preventScroll: true });
  }, [content, children]);

  const emit = useCallback((result: StoryEditResult, addToHistory = true) => {
    if (addToHistory) undoStackRef.current.push(content);
    redoStackRef.current = [];
    selectionRef.current = result.selection;
    pendingSelectionRef.current = result.selection;
    lastEmittedRef.current = result.content;
    onChange(result.content);
  }, [content, onChange]);

  const undo = useCallback(() => {
    const previous = undoStackRef.current.pop();
    if (!previous) return;
    redoStackRef.current.push(content);
    const caret = Math.min(selectionRef.current.head, storyToPlainText(previous).length);
    const selection = { anchor: caret, head: caret };
    selectionRef.current = selection;
    pendingSelectionRef.current = selection;
    lastEmittedRef.current = previous;
    onChange(previous);
  }, [content, onChange]);

  const redo = useCallback(() => {
    const next = redoStackRef.current.pop();
    if (!next) return;
    undoStackRef.current.push(content);
    const caret = Math.min(selectionRef.current.head, storyToPlainText(next).length);
    const selection = { anchor: caret, head: caret };
    selectionRef.current = selection;
    pendingSelectionRef.current = selection;
    lastEmittedRef.current = next;
    onChange(next);
  }, [content, onChange]);

  const insert = useCallback((text: string) => {
    rememberSelection();
    emit(replaceStoryRange(content, selectionRef.current, text));
  }, [content, emit, rememberSelection]);

  useEffect(() => {
    if (pageBreakRequest === lastBreakRequestRef.current) return;
    lastBreakRequestRef.current = pageBreakRequest;
    insert(PAGE_BREAK_CHARACTER);
  }, [insert, pageBreakRequest]);

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
    if (modifier && event.key === "Enter") {
      event.preventDefault();
      insert(PAGE_BREAK_CHARACTER);
    } else if (modifier && event.key.toLowerCase() === "a") {
      event.preventDefault();
      const length = storyToPlainText(content).length;
      const selection = { anchor: 0, head: length };
      selectionRef.current = selection;
      pendingSelectionRef.current = selection;
      const root = rootRef.current;
      if (root) {
        const anchor = findDomPoint(root, 0);
        const head = findDomPoint(root, length);
        if (anchor && head) window.getSelection()?.setBaseAndExtent(anchor[0], anchor[1], head[0], head[1]);
      }
    } else if (modifier && event.key.toLowerCase() === "z") {
      event.preventDefault();
      event.shiftKey ? redo() : undo();
    } else if (modifier && event.key.toLowerCase() === "y") {
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
