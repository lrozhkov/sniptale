// @vitest-environment jsdom

import { act } from 'react';
import { expect, it } from 'vitest';
import { translate } from '../../../platform/i18n';
import {
  cleanupDom,
  createControllerMock,
  flushAsyncWork,
  renderWithController,
  resetEditorStore,
} from '../../../../../../tooling/test/harness/editor/ownership/helpers';

async function renderSidebarForInspector(
  controller: ReturnType<typeof createControllerMock>,
  state: Parameters<typeof resetEditorStore>[0]
) {
  const { EditorInspectorSidebar } = await import('.');

  resetEditorStore(state);
  renderWithController(<EditorInspectorSidebar hasImage />, controller);
  await flushAsyncWork();
}

function getButtonWithText(text: string) {
  return Array.from(document.querySelectorAll('button')).find((button) =>
    button.textContent?.includes(text)
  );
}

function getDisabledButtonWithText(text: string) {
  return Array.from(document.querySelectorAll('button')).find(
    (button) => button.disabled && button.textContent?.includes(text)
  );
}

async function clickOptionalButton(button: HTMLButtonElement | undefined) {
  await act(async () => {
    button?.click();
  });
}

async function expectImageSizeInspectorUsesController(
  controller: ReturnType<typeof createControllerMock>
) {
  await renderSidebarForInspector(controller, { cropReady: false, inspector: 'image-size' });

  const applyImageSizeButton = getDisabledButtonWithText(
    translate('editor.compact.applyImageSize')
  );
  await clickOptionalButton(applyImageSizeButton);

  expect(document.body.textContent).toContain(translate('editor.compact.imageSize'));
  expect(document.body.textContent).not.toContain(translate('editor.compact.cropCanvas'));
  expect(applyImageSizeButton?.hasAttribute('disabled')).toBe(true);
  expect(controller.resizeCanvas).not.toHaveBeenCalled();
}

async function expectCanvasSizeInspectorUsesController(
  controller: ReturnType<typeof createControllerMock>
) {
  cleanupDom();
  await renderSidebarForInspector(controller, { cropReady: false, inspector: 'canvas-size' });

  const applyCanvasSizeButton = getDisabledButtonWithText(
    translate('editor.compact.applyCropCanvas')
  );
  await clickOptionalButton(applyCanvasSizeButton);

  expect(applyCanvasSizeButton?.hasAttribute('disabled')).toBe(true);
  expect(document.body.textContent).toContain(translate('editor.compact.cropCanvas'));
  expect(document.body.textContent).not.toContain(translate('editor.compact.imageSize'));
  expect(controller.resizeCanvas).not.toHaveBeenCalled();
}

async function expectMetaInspectorUsesController(
  controller: ReturnType<typeof createControllerMock>
) {
  cleanupDom();
  await renderSidebarForInspector(controller, { activeTool: 'select', inspector: 'meta' });

  const technicalDataOptions = Array.from(
    document.querySelectorAll<HTMLButtonElement>('.sniptale-glass-option-grid button')
  );
  const insertTechnicalDataButton = getButtonWithText(
    translate('editor.compact.technicalDataInsert')
  );

  expect(insertTechnicalDataButton?.className).toContain('border-none');
  expect(insertTechnicalDataButton?.className).toContain('text-[12px]');

  await act(async () => {
    technicalDataOptions[2]?.click();
    technicalDataOptions[1]?.click();
    technicalDataOptions[0]?.click();
  });
  await act(async () => {
    insertTechnicalDataButton?.click();
  });

  expect(controller.insertTechnicalData).toHaveBeenCalledWith(['url', 'date', 'browser'], 'column');
}

it('renders size and meta inspectors through the same provider-owned controller', async () => {
  const controller = createControllerMock();

  await expectImageSizeInspectorUsesController(controller);
  await expectCanvasSizeInspectorUsesController(controller);
  await expectMetaInspectorUsesController(controller);
}, 30000);
