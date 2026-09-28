import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  applyEditorSelectionSettingsViaController: vi.fn(),
  applyEditorTextSelectionStyle: vi.fn(() => true),
  deleteEditorControllerSelection: vi.fn(),
  duplicateEditorControllerSelection: vi.fn(async () => undefined),
  previewEditorSelectionSettingsViaController: vi.fn(),
  redoEditorControllerSnapshot: vi.fn(async () => undefined),
  resetEditorControllerToOriginal: vi.fn(async () => undefined),
  restoreEditorControllerOriginalDocument: vi.fn(
    async (_controller: unknown, _original: unknown, _persist?: () => Promise<void>) => undefined
  ),
  undoEditorControllerSnapshot: vi.fn(async () => undefined),
}));

vi.mock('../../public-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../public-api')>()),
  applyEditorSelectionSettingsViaController: mocks.applyEditorSelectionSettingsViaController,
  deleteEditorControllerSelection: mocks.deleteEditorControllerSelection,
  duplicateEditorControllerSelection: mocks.duplicateEditorControllerSelection,
  previewEditorSelectionSettingsViaController: mocks.previewEditorSelectionSettingsViaController,
  redoEditorControllerSnapshot: mocks.redoEditorControllerSnapshot,
  resetEditorControllerToOriginal: mocks.resetEditorControllerToOriginal,
  restoreEditorControllerOriginalDocument: mocks.restoreEditorControllerOriginalDocument,
  undoEditorControllerSnapshot: mocks.undoEditorControllerSnapshot,
}));

vi.mock('../../text-formatting', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../text-formatting')>()),
  applyEditorTextSelectionStyle: mocks.applyEditorTextSelectionStyle,
}));

import {
  applySelectionSettingsForController,
  applyTextSelectionStyleForController,
  deleteSelectionForController,
  duplicateSelectionForController,
  previewSelectionSettingsForController,
  redoForController,
  resetToOriginalForController,
  restoreOriginalDocumentForController,
  undoForController,
} from './selection-document-actions';

function createController() {
  return {
    getPublicApiAdapter: vi.fn(() => ({ id: 'adapter' })),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

it.each([true, false])('routes original restoration with autosave=%s', async (withAutosave) => {
  const original = { id: 'raw-source' };
  const snapshot = { id: 'restored' };
  const saveNow = vi.fn(async (serialize: () => unknown) => {
    serialize();
  });
  const controller = {
    getPublicApiAdapter: vi.fn(() => ({ id: 'adapter' })),
    autosaveService: withAutosave ? { saveNow } : null,
    exportDocument: vi.fn(() => snapshot),
  };

  const isCurrent = () => true;
  await restoreOriginalDocumentForController(controller as never, original as never, isCurrent);

  expect(mocks.restoreEditorControllerOriginalDocument).toHaveBeenCalledWith(
    { id: 'adapter' },
    original,
    withAutosave ? expect.any(Function) : undefined,
    isCurrent
  );
  const persist = mocks.restoreEditorControllerOriginalDocument.mock.calls[0]?.[2];
  if (withAutosave) {
    await persist?.();
    expect(saveNow).toHaveBeenCalledOnce();
    expect(controller.exportDocument).toHaveBeenCalledOnce();
  } else {
    expect(saveNow).not.toHaveBeenCalled();
    expect(controller.exportDocument).not.toHaveBeenCalled();
  }
});

it('routes document selection commands through the public api adapter', async () => {
  const controller = createController();

  applySelectionSettingsForController(controller as never);
  previewSelectionSettingsForController(controller as never);
  expect(applyTextSelectionStyleForController(controller as never, 'bold')).toBe(true);
  await undoForController(controller as never);
  await redoForController(controller as never);
  await resetToOriginalForController(controller as never);
  deleteSelectionForController(controller as never);
  await duplicateSelectionForController(controller as never);

  expect(mocks.applyEditorSelectionSettingsViaController).toHaveBeenCalledWith({ id: 'adapter' });
  expect(mocks.previewEditorSelectionSettingsViaController).toHaveBeenCalledWith({ id: 'adapter' });
  expect(mocks.applyEditorTextSelectionStyle).toHaveBeenCalledWith({ id: 'adapter' }, 'bold');
  expect(mocks.undoEditorControllerSnapshot).toHaveBeenCalledWith({ id: 'adapter' });
  expect(mocks.redoEditorControllerSnapshot).toHaveBeenCalledWith({ id: 'adapter' });
  expect(mocks.resetEditorControllerToOriginal).toHaveBeenCalledWith({ id: 'adapter' });
  expect(mocks.deleteEditorControllerSelection).toHaveBeenCalledWith({ id: 'adapter' });
  expect(mocks.duplicateEditorControllerSelection).toHaveBeenCalledWith({ id: 'adapter' });
});
