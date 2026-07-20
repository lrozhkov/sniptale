import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import {
  resolveScenarioCanvasFitScale,
  roundScenarioCanvasZoom,
  stepScenarioCanvasZoom,
  type ScenarioCanvasViewportInsets,
  type ScenarioCanvasViewportSize,
} from './viewport';

export type ScenarioCanvasZoomMode = 'custom' | 'fit';

export interface ScenarioCanvasViewportControls {
  gridVisible: boolean;
  magnetEnabled: boolean;
  onFit: () => void;
  onSetNavigatorVisible?: (visible: boolean) => void;
  onSetGridVisible: (visible: boolean) => void;
  onSetMagnetEnabled: (enabled: boolean) => void;
  onSetSnapToGrid: (enabled: boolean) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomOne: () => void;
  navigatorVisible?: boolean;
  scale: number;
  snapToGrid: boolean;
  zoomMode: ScenarioCanvasZoomMode;
}

export interface ScenarioCanvasViewportController {
  controls: ScenarioCanvasViewportControls;
  gridVisible: boolean;
  magnetEnabled: boolean;
  scale: number;
  snapToGrid: boolean;
  viewportInsets?: ScenarioCanvasViewportInsets | undefined;
  viewportRef: RefObject<HTMLDivElement | null>;
}

type ScenarioCanvasViewportInsetResolver = (
  viewport: ScenarioCanvasViewportSize
) => ScenarioCanvasViewportInsets;

interface ScenarioCanvasViewportOptions {
  fitInsets?: ScenarioCanvasViewportInsets | ScenarioCanvasViewportInsetResolver | undefined;
}

export function useScenarioCanvasViewport(
  canvas: ScenarioCanvasViewportSize,
  options: ScenarioCanvasViewportOptions = {}
): ScenarioCanvasViewportController {
  const viewportRef = useRef<HTMLDivElement>(null);
  const state = useScenarioCanvasViewportState(canvas);
  const viewportInsets = resolveViewportInsets(options.fitInsets, state.viewportSize);
  const scale = resolveScenarioCanvasViewportScale({ canvas, state, viewportInsets });
  const setSteppedZoom = useCallback(
    (direction: 'in' | 'out') => {
      state.setZoomMode('custom');
      state.setCustomZoom(stepScenarioCanvasZoom(scale, direction));
    },
    [scale, state]
  );
  const controls = createScenarioCanvasViewportControls({
    gridVisible: state.gridVisible,
    magnetEnabled: state.magnetEnabled,
    navigatorVisible: state.navigatorVisible,
    scale,
    setCustomZoom: state.setCustomZoom,
    setGridVisible: state.setGridVisible,
    setMagnetEnabled: state.setMagnetEnabled,
    setNavigatorVisible: state.setNavigatorVisible,
    setSnapToGrid: state.setSnapToGrid,
    setSteppedZoom,
    setZoomMode: state.setZoomMode,
    snapToGrid: state.snapToGrid,
    zoomMode: state.zoomMode,
  });

  useScenarioCanvasViewportObserver({ setViewportSize: state.setViewportSize, viewportRef });

  return {
    controls,
    gridVisible: state.gridVisible,
    magnetEnabled: state.magnetEnabled,
    scale,
    snapToGrid: state.snapToGrid,
    viewportInsets,
    viewportRef,
  };
}

function useScenarioCanvasViewportState(canvas: ScenarioCanvasViewportSize) {
  const [viewportSize, setViewportSize] = useState<ScenarioCanvasViewportSize>(() =>
    createInitialScenarioCanvasViewportSize(canvas)
  );
  const [zoomMode, setZoomMode] = useState<ScenarioCanvasZoomMode>('fit');
  const [customZoom, setCustomZoom] = useState(1);
  const [gridVisible, setGridVisible] = useState(true);
  const [magnetEnabled, setMagnetEnabled] = useState(false);
  const [navigatorVisible, setNavigatorVisible] = useState(false);
  const [snapToGrid, setSnapToGrid] = useState(false);

  return {
    customZoom,
    gridVisible,
    magnetEnabled,
    navigatorVisible,
    setCustomZoom,
    setGridVisible,
    setMagnetEnabled,
    setNavigatorVisible,
    setSnapToGrid,
    setViewportSize,
    setZoomMode,
    snapToGrid,
    viewportSize,
    zoomMode,
  };
}

function resolveScenarioCanvasViewportScale(args: {
  canvas: ScenarioCanvasViewportSize;
  state: ReturnType<typeof useScenarioCanvasViewportState>;
  viewportInsets?: ScenarioCanvasViewportInsets | undefined;
}) {
  const fitScale = resolveScenarioCanvasFitScale({
    canvas: args.canvas,
    insets: args.viewportInsets,
    padding: 48,
    viewport: args.state.viewportSize,
  });
  return roundScenarioCanvasZoom(args.state.zoomMode === 'fit' ? fitScale : args.state.customZoom);
}

function createInitialScenarioCanvasViewportSize(
  canvas: ScenarioCanvasViewportSize
): ScenarioCanvasViewportSize {
  return { height: canvas.height + 96, width: canvas.width + 96 };
}

function createScenarioCanvasViewportControls(args: {
  gridVisible: boolean;
  magnetEnabled: boolean;
  navigatorVisible: boolean;
  scale: number;
  setCustomZoom: Dispatch<SetStateAction<number>>;
  setGridVisible: Dispatch<SetStateAction<boolean>>;
  setMagnetEnabled: Dispatch<SetStateAction<boolean>>;
  setNavigatorVisible: Dispatch<SetStateAction<boolean>>;
  setSnapToGrid: Dispatch<SetStateAction<boolean>>;
  setSteppedZoom: (direction: 'in' | 'out') => void;
  setZoomMode: Dispatch<SetStateAction<ScenarioCanvasZoomMode>>;
  snapToGrid: boolean;
  zoomMode: ScenarioCanvasZoomMode;
}): ScenarioCanvasViewportControls {
  return {
    gridVisible: args.gridVisible,
    magnetEnabled: args.magnetEnabled,
    onFit: () => args.setZoomMode('fit'),
    onSetNavigatorVisible: args.setNavigatorVisible,
    onSetGridVisible: args.setGridVisible,
    onSetMagnetEnabled: args.setMagnetEnabled,
    onSetSnapToGrid: args.setSnapToGrid,
    onZoomIn: () => args.setSteppedZoom('in'),
    onZoomOne: () => {
      args.setZoomMode('custom');
      args.setCustomZoom(1);
    },
    onZoomOut: () => args.setSteppedZoom('out'),
    navigatorVisible: args.navigatorVisible,
    scale: args.scale,
    snapToGrid: args.snapToGrid,
    zoomMode: args.zoomMode,
  };
}

function resolveViewportInsets(
  fitInsets: ScenarioCanvasViewportOptions['fitInsets'],
  viewportSize: ScenarioCanvasViewportSize
): ScenarioCanvasViewportInsets | undefined {
  if (!fitInsets) {
    return undefined;
  }
  if (typeof fitInsets === 'function') {
    return fitInsets(viewportSize);
  }
  return fitInsets;
}

function useScenarioCanvasViewportObserver(args: {
  setViewportSize: Dispatch<SetStateAction<ScenarioCanvasViewportSize>>;
  viewportRef: RefObject<HTMLDivElement | null>;
}) {
  const { setViewportSize, viewportRef } = args;
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return undefined;
    }

    const updateSize = () => {
      const rect = viewport.getBoundingClientRect();
      const height = viewport.clientHeight || rect.height;
      const width = viewport.clientWidth || rect.width;
      if (height <= 0 || width <= 0) {
        return;
      }

      setViewportSize((current) =>
        current.height === height && current.width === width ? current : { height, width }
      );
    };
    updateSize();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateSize);
      return () => window.removeEventListener('resize', updateSize);
    }

    const observer = new ResizeObserver(updateSize);
    observer.observe(viewport);
    return () => observer.disconnect();
  });
}
