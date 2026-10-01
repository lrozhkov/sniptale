import { useCallback, useLayoutEffect, useRef } from 'react';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { DrawingObject } from '../../features/drawing/public';
import type { ContentDrawingController } from './controller';
import type { PointerDraft } from './interaction';
import { drawDrawingFrame } from './frame';

export function useDrawingFrameRedraw(args: {
  active: boolean;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  chromeCanvasRef: RefObject<HTMLCanvasElement | null>;
  chromeHidden: boolean;
  controller: ContentDrawingController;
  draftRef: RefObject<PointerDraft | null>;
  draftRevision: number;
  objects: readonly DrawingObject[];
  selectedIds: readonly string[];
  showSelectionChrome: boolean;
  setViewportRevision: Dispatch<SetStateAction<number>>;
  visualRevision: number;
  getObjectOpacity?: (objectId: string) => number;
}) {
  const {
    active,
    canvasRef,
    chromeCanvasRef,
    chromeHidden,
    controller,
    draftRef,
    draftRevision,
    objects,
    selectedIds,
    showSelectionChrome,
    setViewportRevision,
  } = args;
  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawDrawingFrame({
      canvas,
      objects,
      draft: draftRef.current,
      selectedIds,
      root: controller.getScrollRoot(),
      showChrome: false,
      suppressText: true,
      ...(args.getObjectOpacity ? { getObjectOpacity: args.getObjectOpacity } : {}),
    });
    const chromeCanvas = chromeCanvasRef.current;
    if (chromeCanvas)
      drawDrawingFrame({
        canvas: chromeCanvas,
        objects,
        draft: draftRef.current,
        selectedIds,
        root: controller.getScrollRoot(),
        showChrome: active && !chromeHidden && showSelectionChrome,
        renderObjects: false,
      });
  }, [
    active,
    canvasRef,
    chromeCanvasRef,
    chromeHidden,
    controller,
    draftRef,
    objects,
    selectedIds,
    showSelectionChrome,
    args.getObjectOpacity,
  ]);

  const latestRedraw = useRef(redraw);
  const frameRef = useRef<number | null>(null);
  const pendingRef = useRef(false);
  const schedule = useCallback(() => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    frameRef.current = requestAnimationFrame(() => {
      pendingRef.current = false;
      frameRef.current = null;
      latestRedraw.current();
    });
  }, []);

  useLayoutEffect(() => {
    latestRedraw.current = redraw;
    schedule();
  }, [redraw, draftRevision, args.visualRevision, schedule]);

  useLayoutEffect(() => {
    const scrollRoot = controller.getScrollRoot();
    const target: EventTarget = scrollRoot.kind === 'element' ? scrollRoot.element : window;
    const viewportChanged = () => {
      schedule();
      setViewportRevision((value) => value + 1);
    };
    target.addEventListener('scroll', viewportChanged, { passive: true });
    window.addEventListener('resize', viewportChanged);
    window.visualViewport?.addEventListener('resize', viewportChanged);
    window.visualViewport?.addEventListener('scroll', viewportChanged, { passive: true });
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      pendingRef.current = false;
      target.removeEventListener('scroll', viewportChanged);
      window.removeEventListener('resize', viewportChanged);
      window.visualViewport?.removeEventListener('resize', viewportChanged);
      window.visualViewport?.removeEventListener('scroll', viewportChanged);
    };
  }, [active, controller, schedule, setViewportRevision]);
}
