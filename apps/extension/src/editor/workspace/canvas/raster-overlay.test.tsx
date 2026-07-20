// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const controllerMocks = vi.hoisted(() => ({
  renderRasterOverlay: vi.fn(),
  subscribeRasterOverlay: vi.fn(() => () => undefined),
}));

vi.mock('../../application/controller-context', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../application/controller-context')>()),
  useOptionalEditorController: () => controllerMocks,
}));

vi.mock('../../state/useEditorStore', async () => {
  const actual = await vi.importActual<typeof import('../../state/useEditorStore')>(
    '../../state/useEditorStore'
  );
  return actual;
});

import { useEditorStore } from '../../state/useEditorStore';
import { EditorRasterOverlay } from './raster-overlay';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderNode(node: React.ReactNode) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(node));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    clearRect: vi.fn(),
    setTransform: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  vi.stubGlobal(
    'ResizeObserver',
    class ResizeObserver {
      observe = vi.fn();
      disconnect = vi.fn();
      constructor(_callback: ResizeObserverCallback) {}
    }
  );
  useEditorStore.setState({
    activeTool: 'selection',
    rasterSelection: { hasSelection: false, targetLayerId: null, targetLayerName: null },
    viewport: {
      canvasHeight: 100,
      canvasOffsetLeft: 0,
      canvasOffsetTop: 0,
      canvasWidth: 120,
      scrollLeft: 0,
      scrollTop: 0,
      scaledCanvasHeight: 100,
      scaledCanvasWidth: 120,
      viewportHeight: 200,
      viewportWidth: 240,
      zoomPercent: 100,
    },
  } as never);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('canvas-wrapper/raster-overlay', () => {
  it('subscribes to controller overlay rendering and draws against the mirrored canvas size', () => {
    const sourceCanvas = document.createElement('canvas');
    Object.defineProperty(sourceCanvas, 'clientWidth', { value: 120 });
    Object.defineProperty(sourceCanvas, 'clientHeight', { value: 80 });

    renderNode(<EditorRasterOverlay canvasRef={{ current: sourceCanvas }} hasImage={true} />);

    const overlay = container?.querySelector('canvas') as HTMLCanvasElement | null;
    expect(overlay).not.toBeNull();
    expect(controllerMocks.subscribeRasterOverlay).toHaveBeenCalledOnce();
    expect(controllerMocks.renderRasterOverlay).toHaveBeenCalledWith(expect.anything(), {
      width: 120,
      height: 80,
    });
    expect(overlay?.style.width).toBe('120px');
    expect(overlay?.style.height).toBe('80px');
  });

  it('stays hidden when no image is loaded', () => {
    renderNode(<EditorRasterOverlay canvasRef={{ current: null }} hasImage={false} />);

    expect(container?.querySelector('canvas')).toBeNull();
    expect(controllerMocks.subscribeRasterOverlay).not.toHaveBeenCalled();
    expect(controllerMocks.renderRasterOverlay).not.toHaveBeenCalled();
  });
});
