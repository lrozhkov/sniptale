// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Canvas } from 'fabric';
import { afterEach, expect, it, vi } from 'vitest';

import { createFrameAnnotationProxy, readFrameAnnotationSnapshot } from './proxy';
import { useFrameAnnotationKeyboard } from './keyboard';
import type { EditorFrameAnnotationPlaneController } from './types';

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

function renderKeyboardHarness() {
  const canvas = new Canvas(undefined, { renderOnAddRemove: false });
  canvas.requestRenderAll = vi.fn();
  canvas.add(
    createFrameAnnotationProxy({
      frame: { id: 'frame-1', x: 10, y: 20, width: 100, height: 60 },
      label: 'Frame annotation 1',
      ordering: 0,
    })
  );
  const controller: EditorFrameAnnotationPlaneController = {
    canvas,
    canvasDocumentSize: { width: 400, height: 300 },
    commitHistory: vi.fn(),
    prepareObject: vi.fn(),
    syncRuntimeState: vi.fn(),
  };

  function Harness() {
    const [selectedId, setSelectedId] = React.useState<string | null>('frame-1');
    useFrameAnnotationKeyboard({
      commitPendingDraft: vi.fn(),
      controller,
      forceRender: vi.fn(),
      selectedId,
      setSelectedId,
    });
    return null;
  }

  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => root?.render(<Harness />));
  return { canvas, controller };
}

it('nudges the selected frame proxy in logical canvas coordinates', () => {
  const { canvas, controller } = renderKeyboardHarness();

  act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' })));

  expect(readFrameAnnotationSnapshot(canvas.getObjects()[0]!)?.x).toBe(11);
  expect(controller.commitHistory).toHaveBeenCalledOnce();
  expect(controller.syncRuntimeState).toHaveBeenCalledOnce();
});

it('duplicates and then deletes the DOM-selected frame without Fabric selection chrome', () => {
  const { canvas, controller } = renderKeyboardHarness();

  act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', ctrlKey: true })));

  const objects = canvas.getObjects();
  expect(objects).toHaveLength(2);
  expect(readFrameAnnotationSnapshot(objects[1]!)).toMatchObject({ x: 34, y: 44, ordering: 1 });
  expect(objects[1]).toMatchObject({ selectable: false, evented: false });

  act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' })));

  expect(canvas.getObjects()).toHaveLength(1);
  expect(controller.commitHistory).toHaveBeenCalledTimes(2);
});
