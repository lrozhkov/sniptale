import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { queryAllContentUiElements } from '../../../platform/dom-host';
import type { FrameData } from '../../../../features/highlighter/contracts';
import type { FrameHostLayoutSnapshot } from '../host-layout/service';
import {
  ensureBlurFiltersSvgContainer,
  registerImmediateBlurOverlayUpdates,
  registerImmediateFocusOverlayUpdates,
  updateBlurOverlayNodes,
  updateFocusOverlayMask,
  type OverlayRefs,
} from '../effect-overlays/dom';
import {
  areBlurFrameDescriptorsEqual,
  areFocusFrameDescriptorsEqual,
  buildBlurFrameDescriptors,
  buildFocusFrameDescriptors,
  type BlurFrameDescriptor,
  type FocusFrameDescriptor,
} from '../effects/overlay-descriptors';

type UseFrameEffectOverlaysArgs = {
  frames: FrameData[];
  framesRef: MutableRefObject<FrameData[]>;
  hostLayoutSnapshot: FrameHostLayoutSnapshot;
};

export function useFrameEffectOverlays({
  frames,
  framesRef,
  hostLayoutSnapshot,
}: UseFrameEffectOverlaysArgs): void {
  const overlayRefs = useFrameEffectOverlayRefs();
  const renderableFramesRef = useRef<FrameData[]>([]);
  renderableFramesRef.current = framesRef.current.filter(
    (frame) => (hostLayoutSnapshot.presentations.get(frame.id) ?? 'visible') === 'visible'
  );
  const ensureBlurFiltersSvg = useCallback(
    () => ensureBlurFiltersSvgContainer(overlayRefs),
    [overlayRefs]
  );
  const updateDistortionFilterScale = useCallback(
    (scale: number) => {
      const filter = overlayRefs.blurFiltersSvgRef.current?.querySelector(
        '#sniptale-distortion-filter'
      );
      const displacementMap = filter?.querySelector('feDisplacementMap');
      displacementMap?.setAttribute('scale', String(scale));
    },
    [overlayRefs]
  );

  useFrameEffectSync(
    frames,
    renderableFramesRef,
    hostLayoutSnapshot.version,
    overlayRefs,
    ensureBlurFiltersSvg,
    updateDistortionFilterScale
  );
  useImmediateFrameOverlayUpdates(renderableFramesRef, overlayRefs);
  useFrameOverlayUnmountCleanup(overlayRefs);
}

function useFrameEffectOverlayRefs(): OverlayRefs {
  const focusOverlayRef = useRef<HTMLDivElement | null>(null);
  const focusSvgRef = useRef<SVGSVGElement | null>(null);
  const focusMaskIdRef = useRef(`sniptale-focus-mask-${Date.now()}`);
  const blurOverlaysRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const blurFiltersSvgRef = useRef<SVGSVGElement | null>(null);
  const blurFiltersIdRef = useRef(`sniptale-blur-filters-${Date.now()}`);

  return useMemo(
    () => ({
      focusOverlayRef,
      focusSvgRef,
      focusMaskIdRef,
      blurOverlaysRef,
      blurFiltersSvgRef,
      blurFiltersIdRef,
    }),
    []
  );
}

function useFrameEffectSync(
  frames: FrameData[],
  framesRef: MutableRefObject<FrameData[]>,
  presentationVersion: number,
  overlayRefs: OverlayRefs,
  ensureBlurFiltersSvg: () => void,
  updateDistortionFilterScale: (scale: number) => void
) {
  const prevFocusDescriptorsRef = useRef<FocusFrameDescriptor[]>([]);
  const prevBlurDescriptorsRef = useRef<BlurFrameDescriptor[]>([]);

  useEffect(() => {
    const focusDescriptors = buildFocusFrameDescriptors(framesRef.current);
    if (areFocusFrameDescriptorsEqual(focusDescriptors, prevFocusDescriptorsRef.current)) {
      return;
    }

    prevFocusDescriptorsRef.current = focusDescriptors;
    updateFocusOverlayMask(framesRef.current, overlayRefs);
  }, [frames, framesRef, overlayRefs, presentationVersion]);

  useEffect(() => {
    const blurDescriptors = buildBlurFrameDescriptors(framesRef.current);
    if (areBlurFrameDescriptorsEqual(blurDescriptors, prevBlurDescriptorsRef.current)) {
      return;
    }

    prevBlurDescriptorsRef.current = blurDescriptors;
    updateBlurOverlayNodes(
      framesRef.current,
      overlayRefs,
      ensureBlurFiltersSvg,
      updateDistortionFilterScale
    );
  }, [
    ensureBlurFiltersSvg,
    frames,
    framesRef,
    overlayRefs,
    presentationVersion,
    updateDistortionFilterScale,
  ]);
}

function useImmediateFrameOverlayUpdates(
  framesRef: MutableRefObject<FrameData[]>,
  overlayRefs: OverlayRefs
) {
  useEffect(
    () => registerImmediateFocusOverlayUpdates(framesRef, overlayRefs),
    [framesRef, overlayRefs]
  );
  useEffect(
    () => registerImmediateBlurOverlayUpdates(framesRef, overlayRefs),
    [framesRef, overlayRefs]
  );
}

function useFrameOverlayUnmountCleanup(overlayRefs: OverlayRefs) {
  useEffect(() => {
    return () => cleanupFrameOverlayRefs(overlayRefs);
  }, [overlayRefs]);
}

function cleanupFrameOverlayRefs(overlayRefs: OverlayRefs) {
  overlayRefs.focusOverlayRef.current?.remove();
  overlayRefs.focusSvgRef.current?.remove();
  overlayRefs.focusOverlayRef.current = null;
  overlayRefs.focusSvgRef.current = null;

  overlayRefs.blurOverlaysRef.current.forEach((overlay) => {
    overlay.remove();
  });
  overlayRefs.blurOverlaysRef.current.clear();

  overlayRefs.blurFiltersSvgRef.current?.remove();
  overlayRefs.blurFiltersSvgRef.current = null;

  queryAllContentUiElements('.sniptale-focus-overlay, .sniptale-blur-overlay').forEach((node) => {
    node.remove();
  });
  queryAllContentUiElements('svg[id^="sniptale-blur-filters-"]').forEach((node) => {
    node.remove();
  });
}
