import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { queryAllContentUiElements } from '../../../platform/dom-host';
import type { FrameData } from '../../../../features/highlighter/contracts';
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
};

export function useFrameEffectOverlays({ frames, framesRef }: UseFrameEffectOverlaysArgs): void {
  const overlayRefs = useFrameEffectOverlayRefs();
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
    framesRef,
    overlayRefs,
    ensureBlurFiltersSvg,
    updateDistortionFilterScale
  );
  useImmediateFrameOverlayUpdates(framesRef, overlayRefs);
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
  }, [frames, framesRef, overlayRefs]);

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
  }, [ensureBlurFiltersSvg, frames, framesRef, overlayRefs, updateDistortionFilterScale]);
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
