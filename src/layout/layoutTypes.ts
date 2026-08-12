/**
 * Contrato entre conteúdo semântico e renderização. O futuro compositor gera
 * este snapshot; editor e exportador consomem exatamente o mesmo resultado.
 */
export interface TextPosition {
  storyId: string;
  offset: number;
}

export interface LaidOutTextFrame {
  pageId: string;
  storyId: string;
  from: TextPosition;
  to: TextPosition;
}

export interface LayoutSnapshot {
  revision: number;
  textFrames: LaidOutTextFrame[];
  overflowStoryIds: string[];
}

export interface LayoutEngine {
  compose(): Promise<LayoutSnapshot>;
}

