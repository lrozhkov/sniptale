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

it('routes image size and canvas crop through separate fixed modes', async () => {
  const controller = createControllerMock();

  renderWithController(
    renderEditorInspectorContentBody(
      createContentProps({
        inspector: 'image-size',
        cropReady: false,
        imageSizeDraft: { height: 600, width: 900 },
      }) as never,
      controller as never
    ),
    controller
  );
  await act(async () => {
    Array.from(document.querySelectorAll('button'))
      .filter((button) => button.textContent?.includes('editor.compact.applyImageSize'))
      .forEach((button) => button.click());
  });
  expect(document.body.textContent).toContain('editor.compact.imageSize');
  expect(document.body.textContent).not.toContain('editor.compact.cropCanvas');
  expect(controller.resizeImage).toHaveBeenCalledWith(900, 600);
  expect(controller.resizeCanvas).not.toHaveBeenCalled();

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
      .filter((button) => button.textContent?.includes('editor.compact.applyCropCanvas'))
      .forEach((button) => button.click());
  });
  expect(document.body.textContent).toContain('editor.compact.cropCanvas');
  expect(document.body.textContent).not.toContain('editor.compact.imageSize');
  expect(controller.resizeCanvas).toHaveBeenCalledWith(900, 600);
});

it('renders the crop branch without an image-size mode switch', async () => {
  const controller = createControllerMock();

  renderWithController(
    renderEditorInspectorContentBody(
      createContentProps({ inspector: 'tool', highlightedTool: 'crop', cropReady: false }) as never,
      controller as never
    ),
    controller
  );

  expect(document.body.textContent).toContain('editor.compact.cropCanvas');
  expect(document.body.textContent).not.toContain('editor.compact.imageSize');
  expect(controller.previewCanvasSize).not.toHaveBeenCalled();

  await act(async () => {
    Array.from(document.querySelectorAll('button'))
      .filter((button) => button.textContent?.includes('editor.compact.applyCropCanvas'))
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
      .filter((button) => button.textContent?.includes('editor.compact.applyCropCanvas'))
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
