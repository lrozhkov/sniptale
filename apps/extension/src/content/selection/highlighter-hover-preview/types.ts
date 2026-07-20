import type { loadHighlighterSettings } from '../../../composition/persistence/highlighter';

export interface HighlighterHoverState {
  hoverOverlay: HTMLElement | null;
  overlayContainer: HTMLElement | null;
  frameCache: Map<string, { element: HTMLElement; rect: DOMRect }>;
  frameCacheDirty: boolean;
  cachedHighlighterSettings: Awaited<ReturnType<typeof loadHighlighterSettings>> | null;
  settingsLoadPromise: Promise<void> | null;
}
