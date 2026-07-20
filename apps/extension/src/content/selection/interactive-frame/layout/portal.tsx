import React from 'react';
import type { CSSProperties } from 'react';
import { CONTENT_ROOT_ID } from '@sniptale/ui/branding';
import { getContentUiElementById, resolveContentOverlayRoot } from '../../../platform/dom-host';
import { applyIsolatedContentRootStyle } from '../../../platform/dom-host/isolated';
import {
  mergeThemeScopedStyle,
  resolveThemeSafePortalTarget,
  useResolvedPortalTheme,
} from '@sniptale/ui/theme/safe-portal';
import type { EffectMode, ResizeDirection } from '../../../../features/highlighter/contracts';

export const MIN_FRAME_SIZE = 1;
export const Z_INDEX_BLOCKING_OVERLAY = 2147483643;
export const Z_INDEX_RESIZE_HANDLES = 2147483646;
export const Z_INDEX_FLOATING_UI = 2147483647;

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
  x: number,
  y: number,
  width: number,
  height: number
): void {
  if (effectMode === 'blur' && window.sniptaleUpdateBlurOverlayImmediate) {
    window.sniptaleUpdateBlurOverlayImmediate(frameId, x, y, width, height);
  }

  if (effectMode === 'focus' && window.sniptaleUpdateFocusMaskImmediate) {
    window.sniptaleUpdateFocusMaskImmediate(frameId, x, y, width, height);
  }
}

function resolveContentThemeOwner(): HTMLElement | null {
  if (typeof document === 'undefined') {
    return null;
  }

  return document.getElementById(CONTENT_ROOT_ID);
}

export function resolveContentPortalTarget(
  anchorEl?: HTMLElement | null
): ShadowRoot | DocumentFragment | HTMLElement {
  return (
    resolveContentOverlayRoot() ??
    resolveThemeSafePortalTarget(anchorEl ?? resolveContentThemeOwner())
  );
}

export function useContentPortalTheme(source?: HTMLElement | null) {
  return useResolvedPortalTheme(source ?? resolveContentThemeOwner());
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
