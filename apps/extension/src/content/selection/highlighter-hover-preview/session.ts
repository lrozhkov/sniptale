import type { BorderPreset } from '../../../features/highlighter/contracts';
import {
  DEFAULT_BORDER_PRESET,
  loadHighlighterSettings,
} from '../../../composition/persistence/highlighter';
import { createLogger } from '@sniptale/platform/observability/logger';
import type { HighlighterSettingsChangedDetail } from '../../platform/page-context/frame-events';

const settingsLogger = createLogger({ namespace: 'ContentHighlighter:HoverPreviewHelpers' });
const controllerLogger = createLogger({ namespace: 'ContentHighlighter:HoverPreview' });

type HighlighterSettings = Awaited<ReturnType<typeof loadHighlighterSettings>>;

export type HoverFrameCacheEntry = {
  element: HTMLElement;
  rect: DOMRect;
};

export interface HoverSession {
  cachedHighlighterSettings: HighlighterSettings | null;
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
  settingsLoadPromise: Promise<void> | null;
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
    cachedHighlighterSettings: null,
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
    settingsLoadPromise: null,
    freeDraw: {
      clickSuppression: null,
      gesture: null,
      preview: null,
      previewRoot: null,
    },
  };
}

export async function ensureHighlighterSettingsLoaded(session: HoverSession): Promise<void> {
  if (session.cachedHighlighterSettings) return;
  if (session.settingsLoadPromise) return session.settingsLoadPromise;

  const loadPromise = loadHighlighterSettings()
    .then((settings) => {
      session.cachedHighlighterSettings = settings;
    })
    .catch((error) => {
      settingsLogger.error('Failed to load highlighter settings', error);
    })
    .finally(() => {
      if (session.settingsLoadPromise === loadPromise) {
        session.settingsLoadPromise = null;
      }
    });
  session.settingsLoadPromise = loadPromise;
  return loadPromise;
}

export function getCurrentBorderPreset(session: HoverSession): BorderPreset {
  if (!session.cachedHighlighterSettings) return DEFAULT_BORDER_PRESET;
  return (
    session.cachedHighlighterSettings.borderPresets.find(
      (preset) => preset.id === session.cachedHighlighterSettings?.defaultBorderPresetId
    ) ?? DEFAULT_BORDER_PRESET
  );
}

function applyHighlighterSettingsChange(
  session: HoverSession,
  detail: HighlighterSettingsChangedDetail
): boolean {
  const { defaultBorderPresetId } = detail;
  if (!defaultBorderPresetId || !session.cachedHighlighterSettings) return false;
  if (
    !session.cachedHighlighterSettings.borderPresets.some(
      (preset) => preset.id === defaultBorderPresetId
    )
  ) {
    return false;
  }

  session.cachedHighlighterSettings = {
    ...session.cachedHighlighterSettings,
    defaultBorderPresetId,
  };
  session.settingsLoadPromise = null;
  return true;
}

export function invalidateHighlighterSettings(
  session: HoverSession,
  detail?: HighlighterSettingsChangedDetail
): void {
  if (detail && applyHighlighterSettingsChange(session, detail)) {
    controllerLogger.debug('Synced highlighter settings cache from event detail', {
      defaultBorderPresetId: detail.defaultBorderPresetId,
    });
    return;
  }

  session.cachedHighlighterSettings = null;
  session.settingsLoadPromise = null;
  void ensureHighlighterSettingsLoaded(session);
  controllerLogger.debug('Invalidated highlighter settings cache', {
    hasDefaultBorderPresetId: Boolean(detail?.defaultBorderPresetId),
  });
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
