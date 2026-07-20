// @vitest-environment jsdom

import { act } from 'react';
import { expect, it } from 'vitest';
import { translate } from '../../../platform/i18n';
import {
  createControllerMock,
  flushAsyncWork,
  getEditorInspectorOwnershipMocks,
  renderWithController,
  setInputFiles,
} from '../../../../../../tooling/test/harness/editor/ownership/helpers';

function getRequiredValue<T>(value: T | null | undefined, label: string): T {
  expect(value, label).toBeDefined();
  return value as T;
}

async function renderSidebarWithController(controller: ReturnType<typeof createControllerMock>) {
  const { EditorInspectorSidebar } = await import('.');

  renderWithController(<EditorInspectorSidebar hasImage />, controller);
  await flushAsyncWork();
}

function getSidebarFileInputs() {
  const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="file"]'));
  const imageInputs = inputs.filter((input) => input.accept === 'image/*');
  const sessionInput = inputs.find((input) => input.accept.includes('json'));

  expect(imageInputs).toHaveLength(3);

  return {
    backgroundInput: getRequiredValue(imageInputs[1], 'background input'),
    importedSessionInput: getRequiredValue(sessionInput, 'session input'),
    openInput: getRequiredValue(imageInputs[0], 'open image input'),
  };
}

async function dispatchSidebarFileChanges(inputs: ReturnType<typeof getSidebarFileInputs>) {
  setInputFiles(inputs.openInput, [new File(['image'], 'sidebar-open.png', { type: 'image/png' })]);
  setInputFiles(inputs.importedSessionInput, [
    new File(
      [JSON.stringify({ version: 1, sourceImageData: 'data:image/png;base64,session' })],
      'session.json',
      { type: 'application/json' }
    ),
  ]);
  setInputFiles(inputs.backgroundInput, [
    new File(['background'], 'background.png', { type: 'image/png' }),
  ]);

  await act(async () => {
    inputs.openInput.dispatchEvent(new Event('change', { bubbles: true }));
    inputs.importedSessionInput.dispatchEvent(new Event('change', { bubbles: true }));
    inputs.backgroundInput.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await flushAsyncWork();
}

function getApplyCropButton() {
  return Array.from(document.querySelectorAll('button')).find((button) =>
    button.textContent?.includes(translate('editor.compact.apply'))
  );
}

async function clickLayerVisibilityActions() {
  await act(async () => {
    document
      .querySelector<HTMLButtonElement>(`button[title="${translate('editor.toolbar.hideLayer')}"]`)
      ?.click();
    document
      .querySelector<HTMLButtonElement>(`button[title="${translate('editor.toolbar.lockLayer')}"]`)
      ?.click();
  });
}

it('renders the expanded sidebar through the page-owned controller and wires hidden inputs', async () => {
  const { importEditorSessionFromFileMock, openEditorImageFromFileMock } =
    getEditorInspectorOwnershipMocks();
  const controller = createControllerMock();

  await renderSidebarWithController(controller);
  await dispatchSidebarFileChanges(getSidebarFileInputs());

  const applyCropButton = getApplyCropButton();
  expect(applyCropButton).toBeDefined();
  expect(applyCropButton?.disabled).toBe(true);

  await clickLayerVisibilityActions();

  expect(openEditorImageFromFileMock).toHaveBeenCalledOnce();
  expect(importEditorSessionFromFileMock).toHaveBeenCalledOnce();
  expect(controller.applyCropSelection).not.toHaveBeenCalled();
}, 30000);
