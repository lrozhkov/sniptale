// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Canvas } from 'fabric';
import { afterEach, expect, it, vi } from 'vitest';
import { useFrameAnnotationInteraction } from './interaction-controller';
import { createFrameAnnotationProxy, readFrameAnnotationSnapshot } from './proxy';
import type { EditorFrameAnnotationPlaneController } from './types';

let root: Root | null = null;
let host: HTMLDivElement | null = null;
let fabricCanvas: Canvas | null = null;

afterEach(() => {
  act(() => root?.unmount());
  fabricCanvas?.dispose();
  host?.remove();
  root = null;
  host = null;
  fabricCanvas = null;
});

it('continues resizing when the pointer moves outside the annotation plane', () => {
  const object = createFrameAnnotationProxy({
    frame: { id: 'frame-1', x: 10, y: 20, width: 100, height: 60 },
    label: 'Frame annotation 1',
    ordering: 0,
  });
  fabricCanvas = new Canvas(undefined, { renderOnAddRemove: false });
  fabricCanvas.add(object);
  fabricCanvas.requestRenderAll = vi.fn();
  const controller: EditorFrameAnnotationPlaneController = {
    canvas: fabricCanvas,
    canvasDocumentSize: { width: 400, height: 300 },
    commitHistory: vi.fn(),
    prepareObject: vi.fn(),
    snapFrameAnnotationResizeRect: vi.fn(({ rect }) => ({
      ...rect,
      width: 250,
      height: 170,
    })),
    syncRuntimeState: vi.fn(),
  };

  function Harness() {
    const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
    const interaction = useFrameAnnotationInteraction({
      activeTool: 'frame-annotation',
      canvasRef,
      controller,
    });
    const snapshot = readFrameAnnotationSnapshot(object)!;
    return (
      <>
        <canvas ref={canvasRef} />
        <button
          data-ui="resize"
          onPointerDown={(event) =>
            interaction.objectActions.startResize(object, snapshot, event, 'se', null)
          }
        />
      </>
    );
  }

  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root?.render(<Harness />));
  const canvas = host.querySelector('canvas')!;
  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue(createRect(400, 300));

  act(() => {
    host?.querySelector('[data-ui="resize"]')?.dispatchEvent(pointerEvent('pointerdown', 110, 80));
    window.dispatchEvent(pointerEvent('pointermove', 250, 180));
    window.dispatchEvent(pointerEvent('pointerup', 250, 180));
  });

  expect(controller.snapFrameAnnotationResizeRect).toHaveBeenCalledWith({
    direction: 'se',
    excludeId: 'frame-1',
    minimumSize: 8,
    rect: { x: 10, y: 20, width: 240, height: 160 },
  });
  expect(readFrameAnnotationSnapshot(object)).toMatchObject({ width: 250, height: 170 });
  expect(controller.commitHistory).toHaveBeenCalledOnce();
});

it('captures a fast frame move and ignores movement from another pointer', () => {
  const object = createFrameAnnotationProxy({
    frame: { id: 'frame-1', x: 10, y: 20, width: 100, height: 60 },
    label: 'Frame annotation 1',
    ordering: 0,
  });
  fabricCanvas = new Canvas(undefined, { renderOnAddRemove: false });
  fabricCanvas.add(object);
  fabricCanvas.requestRenderAll = vi.fn();
  const controller: EditorFrameAnnotationPlaneController = {
    canvas: fabricCanvas,
    canvasDocumentSize: { width: 400, height: 300 },
    commitHistory: vi.fn(),
    prepareObject: vi.fn(),
    selectLayer: vi.fn(),
    syncRuntimeState: vi.fn(),
  };

  function Harness() {
    const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
    const interaction = useFrameAnnotationInteraction({
      activeTool: 'frame-annotation',
      canvasRef,
      controller,
    });
    const snapshot = readFrameAnnotationSnapshot(object)!;
    return (
      <>
        <canvas ref={canvasRef} />
        <button
          data-ui="move"
          onPointerDown={(event) => interaction.objectActions.startMove(object, snapshot, event)}
        />
      </>
    );
  }

  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root?.render(<Harness />));
  const canvas = host.querySelector('canvas')!;
  const moveButton = host.querySelector<HTMLButtonElement>('[data-ui="move"]')!;
  moveButton.setPointerCapture = vi.fn();
  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue(createRect(400, 300));

  const down = pointerEvent('pointerdown', 20, 30, 7);
  act(() => {
    moveButton.dispatchEvent(down);
    window.dispatchEvent(pointerEvent('pointermove', 25, 35, 7));
    window.dispatchEvent(pointerEvent('pointermove', 200, 210, 8));
    window.dispatchEvent(pointerEvent('pointerup', 25, 35, 7));
  });

  expect(moveButton.setPointerCapture).toHaveBeenCalledWith(7);
  expect(down.defaultPrevented).toBe(true);
  expect(readFrameAnnotationSnapshot(object)).toMatchObject({ x: 15, y: 25 });
  expect(controller.commitHistory).toHaveBeenCalledOnce();
});

function pointerEvent(type: string, clientX: number, clientY: number, pointerId = 1): Event {
  const event = new MouseEvent(type, {
    bubbles: true,
    button: 0,
    cancelable: true,
    clientX,
    clientY,
  });
  Object.defineProperty(event, 'pointerId', { value: pointerId });
  return event;
}

function createRect(width: number, height: number): DOMRect {
  return {
    bottom: height,
    height,
    left: 0,
    right: width,
    top: 0,
    width,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect;
}
