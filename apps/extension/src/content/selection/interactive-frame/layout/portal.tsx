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
import type { EffectMode } from '../../../../features/highlighter/contracts';
import type { FrameSurfaceRect } from '../../../../features/highlighter/frame-surface';
import { FRAME_ANNOTATION_Z_INDEX } from '../../../../features/highlighter/frame-annotation/interaction/z-index';

export const MIN_FRAME_SIZE = 1;
export const Z_INDEX_FRAME_IDLE_MAX = FRAME_ANNOTATION_Z_INDEX.frameIdleMax;
export const Z_INDEX_BLOCKING_OVERLAY = FRAME_ANNOTATION_Z_INDEX.blockingOverlay;
export const Z_INDEX_FRAME_ACTIVE = FRAME_ANNOTATION_Z_INDEX.frameActive;
export const Z_INDEX_CALLOUT_EDITING = FRAME_ANNOTATION_Z_INDEX.calloutEditing;
export const Z_INDEX_RESIZE_HANDLES = FRAME_ANNOTATION_Z_INDEX.resizeHandles;
export const Z_INDEX_FLOATING_UI = FRAME_ANNOTATION_Z_INDEX.floatingUi;
// Annotation content stays above frame surfaces, but below editors, toolbars, and popovers.
export const Z_INDEX_STEP_BADGE = FRAME_ANNOTATION_Z_INDEX.stepBadge;

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
