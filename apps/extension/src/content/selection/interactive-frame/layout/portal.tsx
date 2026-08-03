import React from 'react';
import type { CSSProperties } from 'react';
import {
  getContentUiElementById,
  isContentOwnedElement,
  isContentUiBootstrapFallbackAllowed,
  resolveContentOverlayRoot,
  resolveContentShadowRoot,
  ensureContentUiMountTarget,
} from '../../../platform/dom-host';
import { applyIsolatedContentRootStyle } from '../../../platform/dom-host/isolated';
import {
  mergeThemeScopedStyle,
  resolveThemeSafePortalTarget,
  useResolvedPortalTheme,
} from '@sniptale/ui/theme/safe-portal';
import type { EffectMode, ResizeDirection } from '../../../../features/highlighter/contracts';
import type { FrameSurfaceRect } from '../../../../features/highlighter/frame-surface';

export const MIN_FRAME_SIZE = 1;
export const Z_INDEX_FRAME_IDLE_MAX = 2147483642;
export const Z_INDEX_BLOCKING_OVERLAY = 2147483643;
export const Z_INDEX_FRAME_ACTIVE = 2147483644;
export const Z_INDEX_CALLOUT_VIEWING = 2147483645;
export const Z_INDEX_CALLOUT_EDITING = 2147483646;
export const Z_INDEX_RESIZE_HANDLES = 2147483646;
export const Z_INDEX_FLOATING_UI = 2147483647;
export const Z_INDEX_STEP_BADGE = 2147483647;

export function getCursorForDirection(direction: ResizeDirection): string {
  switch (direction) {
    case 'nw':
    case 'se':
      return 'nwse-resize';
    case 'ne':
    case 'sw':
      return 'nesw-resize';
    case 'n':
    case 's':
      return 'ns-resize';
    case 'e':
    case 'w':
      return 'ew-resize';
    default:
      return 'move';
  }
}

export function updateEffectOverlay(
  effectMode: EffectMode,
  frameId: string,
  geometry: FrameSurfaceRect
): void {
  if (effectMode === 'blur' && window.sniptaleUpdateBlurOverlayImmediate) {
    window.sniptaleUpdateBlurOverlayImmediate(frameId, geometry);
  }

  if (effectMode === 'focus' && window.sniptaleUpdateFocusMaskImmediate) {
    window.sniptaleUpdateFocusMaskImmediate(frameId, geometry);
  }
}

function resolveContentThemeOwner(): HTMLElement | null {
  const host = resolveContentShadowRoot()?.host;
  return host instanceof HTMLElement ? host : null;
}

export function resolveContentPortalTarget(
  anchorEl?: HTMLElement | null
): ShadowRoot | DocumentFragment | HTMLElement {
  const overlayRoot = resolveContentOverlayRoot();
  if (overlayRoot) {
    return overlayRoot;
  }

  if (isContentUiBootstrapFallbackAllowed()) {
    return resolveThemeSafePortalTarget(anchorEl ?? resolveContentThemeOwner());
  }

  return ensureContentUiMountTarget('overlay');
}

export function useContentPortalTheme(source?: HTMLElement | null) {
  const contentThemeOwner = resolveContentThemeOwner();
  const themeSource = source ?? contentThemeOwner;
  const theme = useResolvedPortalTheme(themeSource);
  const canUseThemeSource = source
    ? isContentOwnedElement(source) || isContentUiBootstrapFallbackAllowed()
    : contentThemeOwner !== null;
  return canUseThemeSource ? theme : null;
}

export function getThemedPortalStyle(
  theme: 'light' | 'dark' | null,
  style?: CSSProperties
): CSSProperties | undefined {
  return mergeThemeScopedStyle(theme, style);
}

export function useFixedPortalContainer(
  id: string,
  styleText: string,
  themeSource?: HTMLElement | null
): HTMLDivElement {
  const theme = useContentPortalTheme(themeSource);
  const container = React.useMemo(() => {
    let container = getContentUiElementById<HTMLDivElement>(id);
    if (!container) {
      container = document.createElement('div');
      container.id = id;
      applyIsolatedContentRootStyle(container, styleText);
      resolveContentPortalTarget().appendChild(container);
    }
    return container;
  }, [id, styleText]);

  React.useEffect(() => {
    if (theme) {
      container.setAttribute('data-theme', theme);
      container.style.colorScheme = theme;
      return;
    }

    container.removeAttribute('data-theme');
    container.style.colorScheme = '';
  }, [container, theme]);

  return container;
}
