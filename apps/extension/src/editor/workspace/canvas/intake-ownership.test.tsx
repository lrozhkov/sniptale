// @vitest-environment jsdom
import { act } from 'react';
import { expect, it } from 'vitest';
import {
  createControllerMock,
  getEditorShellOwnershipMocks,
  renderWithController,
  resetEditorStore,
} from '../../../../../../tooling/test/harness/editor/ownership/shell-helpers';
import { createDomFileDragEvent, createImageFile, createTextFile } from './test-support';

function createPasteEvent(file: File) {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', {
    value: {
      files: [file],
      items: [],
    },
  });
  return event;
}

async function flushEditorAction() {
  await act(async () => {
    await Promise.resolve();
  });
}

it('opens dropped images through the existing image-open path', async () => {
  const { openEditorImageFromFileMock } = getEditorShellOwnershipMocks();
  const controller = createControllerMock();
  const { CanvasWrapper } = await import('.');
  const droppedFile = createImageFile('drop.png');

  openEditorImageFromFileMock.mockClear();
  resetEditorStore({ imageData: null, viewportPreviewOpen: false });
  renderWithController(<CanvasWrapper hasImage={false} />, controller);

  const dropzone = document.querySelector('[data-ui="editor.canvas.empty-dropzone"]');
  expect(dropzone).not.toBeNull();

  dropzone?.dispatchEvent(createDomFileDragEvent('drop', { files: [droppedFile] }));
  await flushEditorAction();

  expect(openEditorImageFromFileMock).toHaveBeenCalledWith(
    controller,
    droppedFile,
    expect.any(Function)
  );
});

it('opens pasted images through the existing image-open path', async () => {
  const { openEditorImageFromFileMock } = getEditorShellOwnershipMocks();
  const controller = createControllerMock();
  const { CanvasWrapper } = await import('.');
  const pastedFile = createImageFile('paste.webp', 'image/webp');

  openEditorImageFromFileMock.mockClear();
  resetEditorStore({ imageData: null, viewportPreviewOpen: false });
  renderWithController(<CanvasWrapper hasImage={false} />, controller);

  window.dispatchEvent(createPasteEvent(pastedFile));
  await flushEditorAction();

  expect(openEditorImageFromFileMock).toHaveBeenCalledWith(
    controller,
    pastedFile,
    expect.any(Function)
  );
});

it('inserts dropped and pasted images when a document is already open', async () => {
  const { insertEditorImageFromFileMock, openEditorImageFromFileMock } =
    getEditorShellOwnershipMocks();
  const controller = createControllerMock();
  const { CanvasWrapper } = await import('.');
  const droppedFile = createImageFile('drop.png');
  const pastedFile = createImageFile('paste.png');

  insertEditorImageFromFileMock.mockClear();
  openEditorImageFromFileMock.mockClear();
  resetEditorStore({ viewportPreviewOpen: false });
  renderWithController(<CanvasWrapper hasImage />, controller);

  expect(document.querySelector('[data-ui="editor.canvas.empty-dropzone"]')).toBeNull();
  document
    .querySelector('[data-ui="editor.canvas.wrapper"]')
    ?.dispatchEvent(createDomFileDragEvent('drop', { files: [droppedFile] }));
  window.dispatchEvent(createPasteEvent(pastedFile));
  await flushEditorAction();

  expect(openEditorImageFromFileMock).not.toHaveBeenCalled();
  expect(insertEditorImageFromFileMock).toHaveBeenNthCalledWith(1, controller, droppedFile);
  expect(insertEditorImageFromFileMock).toHaveBeenNthCalledWith(2, controller, pastedFile);
});

it('ignores non-image intake paths and editable paste targets', async () => {
  const { insertEditorImageFromFileMock, openEditorImageFromFileMock } =
    getEditorShellOwnershipMocks();
  const controller = createControllerMock();
  const { CanvasWrapper } = await import('.');
  const textFile = createTextFile();
  const imageFile = createImageFile('paste.png');

  insertEditorImageFromFileMock.mockClear();
  openEditorImageFromFileMock.mockClear();
  resetEditorStore({ imageData: null, viewportPreviewOpen: false });
  renderWithController(<CanvasWrapper hasImage={false} />, controller);

  const button = document.createElement('button');
  document.body.append(button);
  button.dispatchEvent(createPasteEvent(imageFile));
  document
    .querySelector('[data-ui="editor.canvas.empty-dropzone"]')
    ?.dispatchEvent(createDomFileDragEvent('drop', { files: [textFile] }));
  await flushEditorAction();

  expect(openEditorImageFromFileMock).not.toHaveBeenCalled();
  expect(insertEditorImageFromFileMock).not.toHaveBeenCalled();
});
