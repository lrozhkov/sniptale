// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { DEFAULT_EDITOR_WORKSPACE_SETTINGS } from '../../../features/editor/document/constants';
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

  return document.querySelector<HTMLDivElement>('.pointer-events-none.absolute.inset-0.z-20');
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
  expect(document.querySelector('.pointer-events-none.absolute.inset-0.z-20')).toBeNull();
});
