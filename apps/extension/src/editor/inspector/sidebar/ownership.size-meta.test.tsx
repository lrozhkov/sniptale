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

async function clickOptionalButton(button: HTMLButtonElement | undefined) {
  await act(async () => {
    button?.click();
  });
}

async function expectImageSizeInspectorUsesController(
  controller: ReturnType<typeof createControllerMock>
) {
  await renderSidebarForInspector(controller, { inspector: 'image-size' });

  const applyImageSizeButton = getButtonWithText(translate('editor.compact.apply'));
  await clickOptionalButton(applyImageSizeButton);

  expect(document.body.textContent).toContain(translate('editor.compact.canvas'));
  expect(document.body.textContent).toContain(translate('editor.compact.image'));
  expect(applyImageSizeButton?.hasAttribute('disabled')).toBe(true);
  expect(controller.resizeCanvas).not.toHaveBeenCalled();
}

async function expectCanvasSizeInspectorUsesController(
  controller: ReturnType<typeof createControllerMock>
) {
  cleanupDom();
  await renderSidebarForInspector(controller, { inspector: 'canvas-size' });

  const applyCanvasSizeButton = getButtonWithText(translate('editor.compact.apply'));
  await clickOptionalButton(applyCanvasSizeButton);

  expect(applyCanvasSizeButton?.hasAttribute('disabled')).toBe(true);
  expect(controller.resizeCanvas).not.toHaveBeenCalled();
}

async function expectMetaInspectorUsesController(
  controller: ReturnType<typeof createControllerMock>
) {
  cleanupDom();
  await renderSidebarForInspector(controller, { activeTool: 'select', inspector: 'meta' });

  const technicalDataCheckboxes = Array.from(
    document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
  );
  const addTechnicalDataButton = getButtonWithText(translate('common.actions.add'));

  expect(addTechnicalDataButton?.className).toContain('border-none');
  expect(addTechnicalDataButton?.className).toContain('text-[12px]');

  await act(async () => {
    technicalDataCheckboxes[2]?.click();
    technicalDataCheckboxes[1]?.click();
    technicalDataCheckboxes[0]?.click();
    addTechnicalDataButton?.click();
  });

  expect(controller.insertTechnicalData).toHaveBeenCalledWith(['url', 'date', 'browser'], 'column');
}

it('renders size and meta inspectors through the same provider-owned controller', async () => {
  const controller = createControllerMock();

  await expectImageSizeInspectorUsesController(controller);
  await expectCanvasSizeInspectorUsesController(controller);
  await expectMetaInspectorUsesController(controller);
}, 30000);
