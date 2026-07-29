import type { MutableRefObject } from 'react';
import { appendToContentOverlayRoot } from '../../../platform/dom-host';
import { applyIsolatedContentRootStyle } from '../../../platform/dom-host/isolated';
import type { FrameData } from '../../../../features/highlighter/contracts';
import { resolveFrameSurface } from '../../../../features/highlighter/frame-surface';
import { createFocusMaskRectNodes, getFocusMaskBox } from '../effects/geometry';
import type { OverlayRefs } from './types';

export function updateFocusOverlayMask(allFrames: FrameData[], refs: OverlayRefs) {
  const focusFrames = allFrames.filter((frame) => frame.effectMode === 'focus');
  if (focusFrames.length === 0) {
    hideFocusOverlay(refs);
    return;
  }

  const overlayOpacity = focusFrames.reduce(
    (maxOpacity, frame) => Math.max(maxOpacity, frame.focusSettings?.opacity ?? 0.5),
    0.1
  );
  const overlay = ensureFocusOverlay(overlayOpacity, refs);
  const svg = createFocusMaskSvg(focusFrames, refs.focusMaskIdRef.current);

  refs.focusSvgRef.current?.remove();
  overlay.appendChild(svg);
  refs.focusSvgRef.current = svg;
  overlay.style.mask = `url(#${refs.focusMaskIdRef.current})`;
  overlay.style.webkitMask = `url(#${refs.focusMaskIdRef.current})`;
  overlay.style.display = 'block';
}

export function registerImmediateFocusOverlayUpdates(
  framesRef: MutableRefObject<FrameData[]>,
  { focusSvgRef }: OverlayRefs
) {
  window.sniptaleUpdateFocusMaskImmediate = (frameId: string, geometry) => {
    const rect = focusSvgRef.current?.querySelector(`rect[data-frame-id="${frameId}"]`);
    if (!rect) {
      return;
    }

    const frame = framesRef.current.find((currentFrame) => currentFrame.id === frameId);
    if (!frame) {
      return;
    }
    const liveFrame = {
      ...frame,
      ...geometry,
    };
    const focusMaskBox = getFocusMaskBox(liveFrame);
    const surface = resolveFrameSurface(liveFrame);
    rect.setAttribute('x', String(focusMaskBox.x));
    rect.setAttribute('y', String(focusMaskBox.y));
    rect.setAttribute('width', String(focusMaskBox.width));
    rect.setAttribute('height', String(focusMaskBox.height));
    rect.setAttribute('rx', String(surface.geometry.radius));
    rect.setAttribute('ry', String(surface.geometry.radius));
  };

  window.sniptaleGetFocusSvgRef = () => focusSvgRef.current;
  return () => {
    delete window.sniptaleUpdateFocusMaskImmediate;
    delete window.sniptaleGetFocusSvgRef;
  };
}

function hideFocusOverlay({ focusOverlayRef, focusSvgRef }: OverlayRefs) {
  if (focusOverlayRef.current) {
    focusOverlayRef.current.style.display = 'none';
  }
  if (focusSvgRef.current) {
    focusSvgRef.current.remove();
    focusSvgRef.current = null;
  }
}

function ensureFocusOverlay(opacity: number, { focusOverlayRef }: OverlayRefs) {
  if (!focusOverlayRef.current?.isConnected) {
    const overlay = document.createElement('div');
    overlay.className = 'sniptale-focus-overlay';
    applyIsolatedContentRootStyle(
      overlay,
      `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        pointer-events: none;
        z-index: 2147483638;
      `
    );
    appendToContentOverlayRoot(overlay);
    focusOverlayRef.current = overlay;
  }

  const clampedOpacity = Math.min(1, Math.max(0, opacity));
  focusOverlayRef.current.style.background = `rgb(0 0 0 / ${clampedOpacity.toFixed(3)})`;
  return focusOverlayRef.current;
}

function createFocusMaskSvg(focusFrames: FrameData[], maskId: string) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  svg.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  `;

  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  const mask = document.createElementNS('http://www.w3.org/2000/svg', 'mask');
  mask.setAttribute('id', maskId);

  const backgroundRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  backgroundRect.setAttribute('width', '100%');
  backgroundRect.setAttribute('height', '100%');
  backgroundRect.setAttribute('fill', 'white');
  mask.appendChild(backgroundRect);

  createFocusMaskRectNodes(focusFrames).forEach((rect) => {
    mask.appendChild(rect);
  });

  defs.appendChild(mask);
  svg.appendChild(defs);
  return svg;
}
