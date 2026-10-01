// @vitest-environment jsdom
import { act } from 'react';
import { expect, it, vi } from 'vitest';
import { DEFAULT_EDITOR_WORKSPACE_SETTINGS } from '../../../features/editor/document/constants';
import { EditorCanvas } from '../../document/canvas-surface/render-region';
import { useEditorStore } from '../../state/useEditorStore';
import {
  cleanupDom,
  createControllerMock,
  renderWithController,
  resetEditorStore,
} from '../../../../../../tooling/test/harness/editor/ownership/shell-helpers';

async function renderGridSize(gridSize: number) {
  cleanupDom();
  const { CanvasWrapper } = await import('.');
  resetEditorStore({
    viewportPreviewOpen: false,
    workspace: {
      ...DEFAULT_EDITOR_WORKSPACE_SETTINGS,
      gridColor: '#ff0000',
      gridEnabled: true,
      gridSize,
    },
  });
  renderWithController(<CanvasWrapper hasImage />, createControllerMock());

  return document.querySelector<HTMLDivElement>('[data-ui="editor.canvas.document-grid"]');
}

it('renders live grid density variants through the canvas wrapper', async () => {
  const denseOverlay = await renderGridSize(5);
  const defaultOverlay = await renderGridSize(20);
  const largeOverlay = await renderGridSize(30);

  expect(denseOverlay?.style.backgroundSize).toBe('18.75px 18.75px');
  expect(defaultOverlay?.style.backgroundSize).toBe('25px 25px');
  expect(largeOverlay?.style.backgroundSize).toBe('37.5px 37.5px');
});

it('renders the empty intake path without grid overlay when no document is loaded', async () => {
  cleanupDom();
  const { CanvasWrapper } = await import('.');
  resetEditorStore({
    imageData: null,
    viewportPreviewOpen: false,
    workspace: {
      ...DEFAULT_EDITOR_WORKSPACE_SETTINGS,
      gridEnabled: false,
    },
  });

  renderWithController(<CanvasWrapper hasImage={false} />, createControllerMock());

  expect(document.querySelector('[data-ui="editor.canvas.wrapper"]')).not.toBeNull();
  expect(document.querySelector('[data-ui="editor.canvas.empty-dropzone"]')).not.toBeNull();
  expect(document.querySelector('[data-ui="editor.canvas.document-grid"]')).toBeNull();
});

it('updates only live canvas presentation when outside visibility or crop mode changes', async () => {
  resetEditorStore({ showOutsideCanvas: false, canvasCropMode: 'crop', activeTool: 'select' });
  const { CanvasWrapper } = await import('.');
  const canvas = Object.create(EditorCanvas.prototype) as EditorCanvas;
  canvas.setShowOutsideCanvas = vi.fn();
  const controller = {
    ...createControllerMock(),
    getPublicApiAdapter: () => ({ canvas }),
  };
  renderWithController(<CanvasWrapper hasImage />, controller);
  expect(canvas.setShowOutsideCanvas).toHaveBeenLastCalledWith(false);

  act(() => useEditorStore.getState().setShowOutsideCanvas(true));
  expect(canvas.setShowOutsideCanvas).toHaveBeenLastCalledWith(true);

  act(() => useEditorStore.getState().setShowOutsideCanvas(false));
  expect(canvas.setShowOutsideCanvas).toHaveBeenLastCalledWith(false);

  act(() => {
    useEditorStore.getState().setCanvasCropMode('expand');
    useEditorStore.getState().setActiveTool('crop');
  });
  expect(canvas.setShowOutsideCanvas).toHaveBeenLastCalledWith(true);
  act(() => {
    useEditorStore.getState().setShowOutsideCanvas(true);
    useEditorStore.getState().setCanvasCropMode('crop');
  });
});
