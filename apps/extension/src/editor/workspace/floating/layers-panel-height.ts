import { useCallback, useEffect, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useEditorStore } from '../../state/useEditorStore';
import { getPreviewSize } from '../viewport-preview/helpers';

export const LAYERS_PANEL_DEFAULT_HEIGHT = 320;
const LAYERS_PANEL_MIN_HEIGHT = 248;
const VIEW_TOOLBAR_TOP_OFFSET = 12;
const VIEW_TOOLBAR_HEIGHT_GUARD = 44;
const VIEW_TOOLBAR_POPOVER_GAP = 12;
const VIEW_TOOLBAR_MAP_POPOVER_HEIGHT_GUARD = 112;
const VIEW_TOOLBAR_TO_LAYERS_GAP = 12;
const MAP_POPOVER_TOP_GAP = 5;
const MAP_POPOVER_HORIZONTAL_INSET = 24;
const MAP_POPOVER_VERTICAL_CHROME = 26;
const LAYERS_PANEL_TOP_GUARD =
  VIEW_TOOLBAR_TOP_OFFSET +
  VIEW_TOOLBAR_HEIGHT_GUARD +
  VIEW_TOOLBAR_POPOVER_GAP +
  VIEW_TOOLBAR_MAP_POPOVER_HEIGHT_GUARD +
  VIEW_TOOLBAR_TO_LAYERS_GAP;
const LAYERS_PANEL_BOTTOM_GAP = 12;
const LAYERS_HEIGHT_RATIO_PRECISION = 10_000;

function getMaxLayersPanelHeight(canvasWidth: number, canvasHeight: number) {
  if (typeof window === 'undefined') {
    return LAYERS_PANEL_DEFAULT_HEIGHT;
  }

  const toolbar = document.querySelector<HTMLElement>('[data-ui="editor.floating.view-controls"]');
  const toolbarBounds = toolbar?.getBoundingClientRect();
  if (
    !toolbarBounds ||
    toolbarBounds.width <= 0 ||
    toolbarBounds.bottom <= 0 ||
    canvasWidth <= 0 ||
    canvasHeight <= 0
  ) {
    return Math.max(0, window.innerHeight - LAYERS_PANEL_TOP_GUARD - LAYERS_PANEL_BOTTOM_GAP);
  }

  const stackBottom = document
    .querySelector<HTMLElement>('[data-ui="editor.floating.right-stack"]')
    ?.getBoundingClientRect().bottom;
  const panelBottom =
    stackBottom && stackBottom > 0 ? stackBottom : window.innerHeight - LAYERS_PANEL_BOTTOM_GAP;
  const previewHeight = getPreviewSize(
    canvasWidth,
    canvasHeight,
    Math.max(112, toolbarBounds.width - MAP_POPOVER_HORIZONTAL_INSET)
  ).height;
  const mapBottom =
    toolbarBounds.bottom + MAP_POPOVER_TOP_GAP + previewHeight + MAP_POPOVER_VERTICAL_CHROME;
  return Math.max(0, Math.floor(panelBottom - mapBottom - MAP_POPOVER_TOP_GAP));
}

function clampLayersPanelHeight(value: number, canvasWidth: number, canvasHeight: number) {
  const maxHeight = getMaxLayersPanelHeight(canvasWidth, canvasHeight);
  return Math.min(maxHeight, Math.max(Math.min(LAYERS_PANEL_MIN_HEIGHT, maxHeight), value));
}

function resolveLayersPanelHeight(
  heightRatio: number | null,
  defaultHeight: number,
  canvasWidth: number,
  canvasHeight: number
) {
  if (heightRatio === null) {
    return clampLayersPanelHeight(defaultHeight, canvasWidth, canvasHeight);
  }

  return clampLayersPanelHeight(
    getMaxLayersPanelHeight(canvasWidth, canvasHeight) * heightRatio,
    canvasWidth,
    canvasHeight
  );
}

function resolveLayersPanelHeightRatio(height: number, canvasWidth: number, canvasHeight: number) {
  const maxHeight = getMaxLayersPanelHeight(canvasWidth, canvasHeight);
  if (maxHeight <= 0) return 0;
  const preciseRatio = (height / maxHeight) * LAYERS_HEIGHT_RATIO_PRECISION;
  return Math.round(preciseRatio) / LAYERS_HEIGHT_RATIO_PRECISION;
}

export function useResizableLayersPanelHeight(args: {
  defaultHeight: number;
  heightRatio: number | null;
  onHeightRatioChange: (heightRatio: number | null) => void;
}) {
  const { heightRatio, onHeightRatioChange, defaultHeight } = args;
  const canvasWidth = useEditorStore((state) => state.viewport.canvasWidth);
  const canvasHeight = useEditorStore((state) => state.viewport.canvasHeight);
  const [height, setHeight] = useState(() =>
    resolveLayersPanelHeight(heightRatio, defaultHeight, canvasWidth, canvasHeight)
  );

  useEffect(() => {
    setHeight(resolveLayersPanelHeight(heightRatio, defaultHeight, canvasWidth, canvasHeight));
  }, [heightRatio, defaultHeight, canvasWidth, canvasHeight]);

  useEffect(() => {
    const handleResize = () =>
      setHeight(resolveLayersPanelHeight(heightRatio, defaultHeight, canvasWidth, canvasHeight));
    const toolbar = document.querySelector<HTMLElement>(
      '[data-ui="editor.floating.view-controls"]'
    );
    const stack = document.querySelector<HTMLElement>('[data-ui="editor.floating.right-stack"]');
    const observer =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(handleResize) : null;
    if (toolbar) observer?.observe(toolbar);
    if (stack) observer?.observe(stack);
    window.addEventListener('resize', handleResize);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', handleResize);
    };
  }, [heightRatio, defaultHeight, canvasWidth, canvasHeight]);

  const startResize = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      const target = event.currentTarget;
      target.setPointerCapture(event.pointerId);
      const pointerId = event.pointerId;
      const startY = event.clientY;
      const startHeight = height;
      let nextHeight = startHeight;
      const handlePointerMove = (moveEvent: PointerEvent) => {
        nextHeight = clampLayersPanelHeight(
          startHeight + startY - moveEvent.clientY,
          canvasWidth,
          canvasHeight
        );
        setHeight(nextHeight);
      };
      const handlePointerUp = () => {
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
        window.removeEventListener('pointercancel', handlePointerUp);
        if (target.hasPointerCapture(pointerId)) {
          target.releasePointerCapture(pointerId);
        }
        onHeightRatioChange(resolveLayersPanelHeightRatio(nextHeight, canvasWidth, canvasHeight));
      };

      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
      window.addEventListener('pointercancel', handlePointerUp);
    },
    [height, onHeightRatioChange, canvasWidth, canvasHeight]
  );

  return { height, startResize };
}
