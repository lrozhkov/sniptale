import {
  getContentUiElementById,
  queryAllContentUiElements,
  queryContentUiElement,
} from '../../platform/dom-host';
import type { BorderPreset } from '../../../features/highlighter/contracts';
import { createLogger } from '@sniptale/platform/observability/logger';
import {
  DEFAULT_BORDER_PRESET,
  loadHighlighterSettings,
} from '../../../composition/persistence/highlighter';
import type { HighlighterSettingsChangedDetail } from '../../platform/page-context/frame-events';
import { isContentRuntimeUiElement } from '../../platform/page-context/dom';
import type { HighlighterHoverState } from './types';
import { HIGHLIGHTER_EXTENSION_UI_CLASSES, HIGHLIGHTER_EXTENSION_UI_SELECTOR } from './constants';
export {
  ensureHighlighterOverlayContainer,
  ensureHoverOverlay,
  hideHoverOverlay,
  removeHighlighterOverlayContainer,
  removeHoverOverlay,
  showHoverOverlay,
} from './overlay';

const logger = createLogger({ namespace: 'ContentHighlighter:HoverPreviewHelpers' });

export function createHighlighterHoverState(): HighlighterHoverState {
  return {
    hoverOverlay: null,
    overlayContainer: null,
    frameCache: new Map<string, { element: HTMLElement; rect: DOMRect }>(),
    frameCacheDirty: true,
    cachedHighlighterSettings: null,
    settingsLoadPromise: null,
  };
}

export async function ensureHighlighterSettingsLoaded(state: HighlighterHoverState): Promise<void> {
  if (state.cachedHighlighterSettings) return;
  if (state.settingsLoadPromise) return state.settingsLoadPromise;

  const loadPromise = loadHighlighterSettings()
    .then((settings) => {
      state.cachedHighlighterSettings = settings;
    })
    .catch((error) => {
      logger.error('Failed to load highlighter settings', error);
    })
    .finally(() => {
      if (state.settingsLoadPromise === loadPromise) {
        state.settingsLoadPromise = null;
      }
    });
  state.settingsLoadPromise = loadPromise;

  return loadPromise;
}

export function getCurrentBorderPreset(state: HighlighterHoverState): BorderPreset {
  if (!state.cachedHighlighterSettings) {
    return DEFAULT_BORDER_PRESET;
  }

  return (
    state.cachedHighlighterSettings.borderPresets.find(
      (preset) => preset.id === state.cachedHighlighterSettings?.defaultBorderPresetId
    ) || DEFAULT_BORDER_PRESET
  );
}

export function applyHighlighterSettingsChange(
  state: HighlighterHoverState,
  detail: HighlighterSettingsChangedDetail
): boolean {
  const { defaultBorderPresetId } = detail;

  if (!defaultBorderPresetId || !state.cachedHighlighterSettings) {
    return false;
  }

  if (
    !state.cachedHighlighterSettings.borderPresets.some(
      (preset) => preset.id === defaultBorderPresetId
    )
  ) {
    return false;
  }

  state.cachedHighlighterSettings = {
    ...state.cachedHighlighterSettings,
    defaultBorderPresetId,
  };
  state.settingsLoadPromise = null;
  return true;
}

function updateHighlighterFrameCache(state: HighlighterHoverState): void {
  if (!state.frameCacheDirty) return;

  state.frameCache.clear();
  queryAllContentUiElements('.sniptale-interactive-frame').forEach((frame) => {
    const element = frame as HTMLElement;
    state.frameCache.set(element.id || element.className, {
      element,
      rect: element.getBoundingClientRect(),
    });
  });

  state.frameCacheDirty = false;
}

export function isNearExistingFrameBorder(
  state: HighlighterHoverState,
  x: number,
  y: number
): boolean {
  const exclusionRadius = 30;
  updateHighlighterFrameCache(state);

  for (const frameData of state.frameCache.values()) {
    const { rect } = frameData;
    const expandedLeft = rect.left - exclusionRadius;
    const expandedRight = rect.right + exclusionRadius;
    const expandedTop = rect.top - exclusionRadius;
    const expandedBottom = rect.bottom + exclusionRadius;

    if (x >= expandedLeft && x <= expandedRight && y >= expandedTop && y <= expandedBottom) {
      return !(x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom);
    }
  }

  return false;
}

function hasHighlighterUiClass(target: HTMLElement) {
  return HIGHLIGHTER_EXTENSION_UI_CLASSES.some((className) => target.classList.contains(className));
}

export function isHighlighterExtensionUiElement(target: HTMLElement): boolean {
  if (hasHighlighterUiClass(target)) {
    return true;
  }

  const popoverPortal =
    getContentUiElementById('sniptale-toolbar-portal') ??
    queryContentUiElement('.sniptale-toolbar-portal-wrapper');
  return isContentRuntimeUiElement(target, {
    closestSelectors: ['.sniptale-action-toolbar', HIGHLIGHTER_EXTENSION_UI_SELECTOR],
    portalElements: [popoverPortal],
  });
}
