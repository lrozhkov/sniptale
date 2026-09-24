// @vitest-environment jsdom

import { Canvas } from 'fabric';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EDITOR_WORKSPACE_MARGIN } from '../../viewport/editing-surface';

const mocks = vi.hoisted(() => ({
  applyEditorViewportZoom: vi.fn(),
}));

vi.mock('../../viewport', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../viewport')>()),
  applyEditorViewportZoom: mocks.applyEditorViewportZoom,
}));

import {
  freezeCanvasVisualDuringLoad,
  maskCanvasElementDuringLoad,
  prepareCanvasForDocumentLoad,
  renderCanvasAfterDocumentLoad,
} from './canvas';

function registerPrepareCanvasTest() {
  it('prepares canvas dimensions and viewport zoom for document load', () => {
    const canvas = {
      backgroundColor: 'black',
      backgroundImage: 'image',
      setDimensions: vi.fn(),
      setZoom: vi.fn(),
    };

    prepareCanvasForDocumentLoad({
      canvas: canvas as never,
      canvasSize: { height: 20, width: 30 },
      viewportDevicePixelRatioBaseline: 2,
      zoomLevel: 1.5,
    });

    expect('backgroundImage' in canvas).toBe(false);
    expect(canvas.setZoom).toHaveBeenCalledWith(1);
    expect(canvas.setDimensions).toHaveBeenCalledWith({ height: 20, width: 30 });
    expect(mocks.applyEditorViewportZoom).toHaveBeenCalledWith(
      canvas,
      { height: 20, width: 30 },
      1.5,
      2
    );
    expect(canvas.backgroundColor).toBe('transparent');
  });

  it('prepares a real editing surface with image coordinates inset from its edges', () => {
    const canvas = new Canvas(document.createElement('canvas'));

    prepareCanvasForDocumentLoad({
      canvas,
      canvasSize: { width: 100, height: 80 },
      zoomLevel: 1,
    });

    expect(canvas.getWidth()).toBe(100 + EDITOR_WORKSPACE_MARGIN * 2);
    expect(canvas.getHeight()).toBe(80 + EDITOR_WORKSPACE_MARGIN * 2);
    expect(canvas.viewportTransform[4]).toBe(EDITOR_WORKSPACE_MARGIN);
    expect(canvas.viewportTransform[5]).toBe(EDITOR_WORKSPACE_MARGIN);
  });
}

function registerCanvasMaskTest() {
  it('keeps the previous canvas pixels visible until history replay finishes', () => {
    const element = document.createElement('canvas');
    element.width = 20;
    element.height = 10;
    const wrapper = document.createElement('div');
    wrapper.append(element);
    const context = element.getContext('2d')!;
    context.fillStyle = '#ff0000';
    context.fillRect(0, 0, 20, 10);

    const restore = freezeCanvasVisualDuringLoad({
      lowerCanvasEl: element,
      wrapperEl: wrapper,
    } as never);
    const snapshot = wrapper.querySelector('canvas:last-child') as HTMLCanvasElement;
    expect(snapshot).not.toBe(element);
    expect(Array.from(snapshot.getContext('2d')!.getImageData(5, 5, 1, 1).data)).toEqual([
      255, 0, 0, 255,
    ]);
    expect(snapshot.style.pointerEvents).toBe('none');
    restore?.();
    expect(wrapper.children).toHaveLength(1);
  });

  it('masks and restores canvas element background during load', () => {
    const style = { backgroundColor: 'initial' };
    const restore = maskCanvasElementDuringLoad(
      { getElement: () => ({ style }) } as never,
      '#112233'
    );

    expect(style.backgroundColor).toBe('#112233');
    restore?.();
    expect(style.backgroundColor).toBe('initial');
  });

  it('uses the legacy lower canvas when needed and tolerates an absent element', () => {
    const style = { backgroundColor: 'initial' };
    const restore = maskCanvasElementDuringLoad({ lowerCanvasEl: { style } } as never, '#334455');
    expect(style.backgroundColor).toBe('#334455');
    restore?.();
    expect(style.backgroundColor).toBe('initial');
    expect(maskCanvasElementDuringLoad({} as never, '#334455')).toBeUndefined();
  });
}

function registerCanvasRenderTest() {
  it('uses sync render when available and falls back to requestRenderAll', () => {
    const renderAllCanvas = { renderAll: vi.fn(), requestRenderAll: vi.fn() };
    renderCanvasAfterDocumentLoad(renderAllCanvas as never);
    expect(renderAllCanvas.renderAll).toHaveBeenCalledOnce();

    const asyncCanvas = { requestRenderAll: vi.fn() };
    renderCanvasAfterDocumentLoad(asyncCanvas as never);
    expect(asyncCanvas.requestRenderAll).toHaveBeenCalledOnce();
  });
}

function runDocumentApplyCanvasSuite() {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  registerPrepareCanvasTest();
  registerCanvasMaskTest();
  registerCanvasRenderTest();
}

describe('document apply canvas owner', runDocumentApplyCanvasSuite);
