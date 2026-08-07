import type { MutableRefObject } from 'react';
import { appendToContentOverlayRoot } from '../../../platform/dom-host';
import { applyIsolatedContentRootStyle } from '../../../platform/dom-host/isolated';
import type { FrameData } from '../../../../features/highlighter/contracts';
import { resolveFocusCutoutGeometry } from '../../../../features/highlighter/frame-surface';
import {
  createFocusMaskRectNodes,
  getFocusMaskBox,
  setFocusMaskRectBox,
} from '../effects/geometry';
import type { OverlayRefs } from './types';
import type { AnchorPresentation } from '../host-layout/service';

export function updateFocusOverlayMask(
  allFrames: FrameData[],
  refs: OverlayRefs,
  presentations: ReadonlyMap<string, AnchorPresentation> = new Map(),
  visualScale = 1
) {
  const focusFrames = allFrames.filter((frame) => frame.effectMode === 'focus');
  if (focusFrames.length === 0) {
    hideFocusOverlay(refs);
    return;
  }

  const overlayOpacity = focusFrames.reduce(
    (maxOpacity, frame) => Math.max(maxOpacity, frame.focusSettings?.opacity ?? 0.5),
    0
  );
  const overlayBlurAmount = focusFrames.reduce(
    (maxAmount, frame) => Math.max(maxAmount, frame.focusSettings?.blurAmount ?? 0),
    0
  );
  const overlay = ensureFocusOverlay(overlayOpacity, overlayBlurAmount, refs);
  const cutoutFrames = focusFrames.filter(
    (frame) => (presentations.get(frame.id) ?? 'visible') !== 'offscreen'
  );
  const svg = createFocusMaskSvg(cutoutFrames, refs.focusMaskIdRef.current, visualScale);

  refs.focusSvgRef.current?.remove();
  overlay.appendChild(svg);
  refs.focusSvgRef.current = svg;
  overlay.style.mask = `url(#${refs.focusMaskIdRef.current})`;
  overlay.style.webkitMask = `url(#${refs.focusMaskIdRef.current})`;
  overlay.style.display = 'block';
}

export function registerImmediateFocusOverlayUpdates(
  framesRef: MutableRefObject<FrameData[]>,
  { focusSvgRef }: OverlayRefs,
  visualScaleRef?: MutableRefObject<number>
) {
  window.sniptaleUpdateFocusMaskImmediate = (frameId: string, geometry) => {
    const rect = focusSvgRef.current?.querySelector<SVGRectElement>(
      `rect[data-frame-id="${frameId}"]`
    );
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
    const cutout = resolveFocusCutoutGeometry(liveFrame);
    setFocusMaskRectBox(rect, focusMaskBox);
    const radius = cutout.radius * (visualScaleRef?.current ?? 1);
    rect.setAttribute('rx', String(radius));
    rect.setAttribute('ry', String(radius));
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

function ensureFocusOverlay(opacity: number, blurAmount: number, { focusOverlayRef }: OverlayRefs) {
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
  const clampedBlurAmount = Math.min(25, Math.max(0, blurAmount));
  focusOverlayRef.current.style.background = `rgb(0 0 0 / ${clampedOpacity.toFixed(3)})`;
  focusOverlayRef.current.style.backdropFilter = `blur(${clampedBlurAmount}px)`;
  focusOverlayRef.current.style.setProperty(
    '-webkit-backdrop-filter',
    `blur(${clampedBlurAmount}px)`
  );
  return focusOverlayRef.current;
}

function createFocusMaskSvg(focusFrames: FrameData[], maskId: string, visualScale: number) {
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

  createFocusMaskRectNodes(focusFrames, visualScale).forEach((rect) => {
    mask.appendChild(rect);
  });

  defs.appendChild(mask);
  svg.appendChild(defs);
  return svg;
}
