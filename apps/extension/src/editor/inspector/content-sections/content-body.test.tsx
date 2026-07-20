// @vitest-environment jsdom
import { act } from 'react';
import { expect, it, vi } from 'vitest';

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

import {
  cleanupDom,
  createControllerMock,
  renderWithController,
} from '../../../../../../tooling/test/harness/editor/ownership/helpers';
import { createContentProps } from '../../../../../../tooling/test/harness/editor/ownership/fixtures';
import { renderEditorInspectorContentBody } from './content-body';

it('routes legacy size branches through the combined resize owner', async () => {
  const controller = createControllerMock();

  renderWithController(
    renderEditorInspectorContentBody(
      createContentProps({
        inspector: 'image-size',
        cropReady: false,
        canvasSize: { height: 720, width: 1280 },
        canvasSizeDraft: { height: 600, width: 900 },
      }) as never,
      controller as never
    ),
    controller
  );
  await act(async () => {
    Array.from(document.querySelectorAll('button'))
      .filter((button) => button.textContent?.includes('editor.compact.apply'))
      .forEach((button) => button.click());
  });
  expect(document.body.textContent).toContain('editor.compact.canvas');
  expect(document.body.textContent).toContain('editor.compact.image');
  expect(controller.resizeCanvas).toHaveBeenCalledWith(900, 600);

  cleanupDom();
  renderWithController(
    renderEditorInspectorContentBody(
      createContentProps({
        inspector: 'canvas-size',
        cropReady: false,
        canvasSize: { height: 720, width: 1280 },
        canvasSizeDraft: { height: 600, width: 900 },
      }) as never,
      controller as never
    ),
    controller
  );
  await act(async () => {
    Array.from(document.querySelectorAll('button'))
      .filter((button) => button.textContent?.includes('editor.compact.apply'))
      .forEach((button) => button.click());
  });
  expect(document.body.textContent).toContain('editor.compact.canvas');
  expect(document.body.textContent).toContain('editor.compact.image');
  expect(controller.resizeCanvas).toHaveBeenCalledWith(900, 600);
});

it('renders the combined canvas and image resize tool branch', async () => {
  const controller = createControllerMock();

  renderWithController(
    renderEditorInspectorContentBody(
      createContentProps({ inspector: 'tool', highlightedTool: 'crop', cropReady: false }) as never,
      controller as never
    ),
    controller
  );

  expect(document.body.textContent).toContain('editor.compact.canvas');
  expect(document.body.textContent).toContain('editor.compact.image');
  expect(controller.previewCanvasSize).not.toHaveBeenCalled();

  await act(async () => {
    Array.from(document.querySelectorAll('button'))
      .filter((button) => button.textContent?.includes('editor.compact.apply'))
      .forEach((button) => button.click());
  });

  expect(controller.resizeCanvas).not.toHaveBeenCalled();
});

it('applies the active crop selection from the floating canvas-size inspector', async () => {
  const controller = createControllerMock();

  renderWithController(
    renderEditorInspectorContentBody(
      createContentProps({
        inspector: 'canvas-size',
        cropReady: true,
        canvasSize: { height: 720, width: 1280 },
        canvasSizeDraft: { height: 600, width: 900 },
      }) as never,
      controller as never
    ),
    controller
  );

  await act(async () => {
    Array.from(document.querySelectorAll('button'))
      .filter((button) => button.textContent?.includes('editor.compact.apply'))
      .forEach((button) => button.click());
  });

  expect(controller.applyCropSelection).toHaveBeenCalledOnce();
  expect(controller.resizeCanvas).not.toHaveBeenCalled();
});

it('routes frame and surface branches without widening the owner seam', () => {
  const controller = createControllerMock();

  expect(
    renderEditorInspectorContentBody(
      createContentProps({ inspector: 'frame' }) as never,
      controller as never
    )
  ).not.toBeNull();
  expect(
    renderEditorInspectorContentBody(
      createContentProps({ inspector: 'meta' }) as never,
      controller as never
    )
  ).not.toBeNull();
});
