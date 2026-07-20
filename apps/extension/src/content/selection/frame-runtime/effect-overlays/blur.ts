import type { MutableRefObject } from 'react';
import { appendToContentOverlayRoot } from '../../../platform/dom-host';
import { applyIsolatedContentRootStyle } from '../../../platform/dom-host/isolated';
import type { FrameData } from '../../../../features/highlighter/contracts';
import { getBlurBackdropStyle, getBlurOverlayBox } from '../effects/geometry';
import type { OverlayRefs } from './types';

export function updateBlurOverlayNodes(
  allFrames: FrameData[],
  refs: OverlayRefs,
  ensureBlurFiltersSvg: () => void,
  updateDistortionFilterScale: (scale: number) => void
) {
  const blurFrames = allFrames.filter((frame) => frame.effectMode === 'blur');
  const blurFrameIds = new Set(blurFrames.map((frame) => frame.id));

  removeStaleBlurOverlays(blurFrameIds, refs);
  if (blurFrames.length === 0) {
    refs.blurFiltersSvgRef.current?.remove();
    refs.blurFiltersSvgRef.current = null;
    return;
  }

  if (blurFrames.some((frame) => frame.blurSettings?.blurType === 'distortion')) {
    ensureBlurFiltersSvg();
  }

  blurFrames.forEach((frame) => {
    const overlay = getOrCreateBlurOverlay(frame.id, refs);
    applyBlurOverlayFrame(overlay, frame, updateDistortionFilterScale);
  });
}

export function registerImmediateBlurOverlayUpdates(
  framesRef: MutableRefObject<FrameData[]>,
  { blurOverlaysRef }: OverlayRefs
) {
  window.sniptaleUpdateBlurOverlayImmediate = (
    frameId: string,
    x: number,
    y: number,
    width: number,
    height: number
  ) => {
    const overlay = blurOverlaysRef.current.get(frameId);
    const frame = framesRef.current.find((currentFrame) => currentFrame.id === frameId);
    if (!overlay || !frame) {
      return;
    }

    const overlayBox = getBlurOverlayBox({
      x,
      y,
      width,
      height,
      ...(frame.borderSettings === undefined ? {} : { borderSettings: frame.borderSettings }),
      ...(frame.blurSettings === undefined ? {} : { blurSettings: frame.blurSettings }),
    });

    overlay.style.left = `${overlayBox.x}px`;
    overlay.style.top = `${overlayBox.y}px`;
    overlay.style.width = `${overlayBox.width}px`;
    overlay.style.height = `${overlayBox.height}px`;
  };

  return () => {
    delete window.sniptaleUpdateBlurOverlayImmediate;
  };
}

function removeStaleBlurOverlays(blurFrameIds: Set<string>, { blurOverlaysRef }: OverlayRefs) {
  blurOverlaysRef.current.forEach((overlay, frameId) => {
    if (blurFrameIds.has(frameId)) {
      return;
    }

    overlay.remove();
    blurOverlaysRef.current.delete(frameId);
  });
}

function getOrCreateBlurOverlay(frameId: string, { blurOverlaysRef }: OverlayRefs) {
  let overlay = blurOverlaysRef.current.get(frameId);
  if (overlay) {
    return overlay;
  }

  overlay = document.createElement('div');
  overlay.className = 'sniptale-blur-overlay';
  overlay.dataset['frameId'] = frameId;
  applyIsolatedContentRootStyle(
    overlay,
    `
      position: fixed;
      pointer-events: none;
      z-index: 2147483639;
    `
  );
  appendToContentOverlayRoot(overlay);
  blurOverlaysRef.current.set(frameId, overlay);
  return overlay;
}

function applyBlurOverlayFrame(
  overlay: HTMLDivElement,
  frame: FrameData,
  updateDistortionFilterScale: (scale: number) => void
) {
  const overlayBox = getBlurOverlayBox(frame);
  const backdropStyle = getBlurBackdropStyle(frame);

  if (backdropStyle.distortionScale != null) {
    updateDistortionFilterScale(backdropStyle.distortionScale);
  }

  overlay.style.left = `${overlayBox.x}px`;
  overlay.style.top = `${overlayBox.y}px`;
  overlay.style.width = `${overlayBox.width}px`;
  overlay.style.height = `${overlayBox.height}px`;
  overlay.style.backgroundColor = backdropStyle.backgroundColor;
  overlay.style.imageRendering = backdropStyle.imageRendering;
  overlay.style.backdropFilter = backdropStyle.backdropFilter;
  (overlay.style as CSSStyleDeclaration & { webkitBackdropFilter?: string }).webkitBackdropFilter =
    backdropStyle.backdropFilter;
  overlay.style.borderRadius = frame.borderSettings?.radius
    ? `${frame.borderSettings.radius}px`
    : '0';
  overlay.style.border = 'none';
}
