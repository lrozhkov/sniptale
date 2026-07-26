import type { BorderPreset } from '../../../features/highlighter/contracts';
import { getFrameSessionBorderPreset } from '../frame-runtime/session/border-preset';

export type HoverFrameCacheEntry = {
  element: HTMLElement;
  rect: DOMRect;
};

export interface HoverSession {
  frameCache: Map<string, HoverFrameCacheEntry>;
  frameCacheDirty: boolean;
  hoverOverlay: HTMLElement | null;
  hoverRafId: number | null;
  isHoverPreviewFrozen: boolean;
  lastHoverProcessTime: number;
  lastHoverTarget: HTMLElement | null;
  lastHoverX: number;
  lastHoverY: number;
  overlayContainer: HTMLElement | null;
  freeDraw: {
    clickSuppression: {
      awaitingPointerUp: boolean;
      pointerId: number;
    } | null;
    gesture: {
      ownerDocument: Document;
      pointerId: number;
      sourceElement: HTMLElement;
      startX: number;
      startY: number;
      viewportBounds: { x: number; y: number; width: number; height: number };
      isDrawing: boolean;
    } | null;
    preview: HTMLElement | null;
    previewRoot: HTMLElement | null;
  };
}

export type HoverDomSession = Pick<HoverSession, 'hoverOverlay' | 'overlayContainer'>;
export type HoverFrameCacheSession = Pick<HoverSession, 'frameCache' | 'frameCacheDirty'>;
export type HoverTrackingSession = Pick<
  HoverSession,
  | 'hoverRafId'
  | 'isHoverPreviewFrozen'
  | 'lastHoverProcessTime'
  | 'lastHoverTarget'
  | 'lastHoverX'
  | 'lastHoverY'
>;

export function createHoverSession(): HoverSession {
  return {
    frameCache: new Map<string, HoverFrameCacheEntry>(),
    frameCacheDirty: true,
    hoverOverlay: null,
    hoverRafId: null,
    isHoverPreviewFrozen: false,
    lastHoverProcessTime: 0,
    lastHoverTarget: null,
    lastHoverX: -1,
    lastHoverY: -1,
    overlayContainer: null,
    freeDraw: {
      clickSuppression: null,
      gesture: null,
      preview: null,
      previewRoot: null,
    },
  };
}

export function getCurrentBorderPreset(): BorderPreset {
  return getFrameSessionBorderPreset();
}

export function invalidateHoverFrameCache(session: HoverFrameCacheSession): void {
  session.frameCacheDirty = true;
}

export function readHoverFrameCache(
  session: HoverFrameCacheSession,
  refresh: () => Iterable<readonly [string, HoverFrameCacheEntry]>
): ReadonlyMap<string, HoverFrameCacheEntry> {
  if (!session.frameCacheDirty) return session.frameCache;
  session.frameCache.clear();
  for (const [key, entry] of refresh()) session.frameCache.set(key, entry);
  session.frameCacheDirty = false;
  return session.frameCache;
}
