import { beforeEach, describe, expect, it, vi } from 'vitest';

const openGalleryPageMock = vi.hoisted(() => vi.fn());
const isEditorStoragePromptErrorMock = vi.hoisted(() => vi.fn());

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal()),
  translate: (key: string) => key,
}));

vi.mock('../../../platform/navigation/extension-pages', async (importOriginal) => ({
  ...(await importOriginal()),
  openGalleryPage: openGalleryPageMock,
}));

vi.mock('../../document/file-actions', async (importOriginal) => ({
  ...(await importOriginal()),
  isEditorStoragePromptError: isEditorStoragePromptErrorMock,
}));

import { maybeHandleEditorSaveFailure } from './save-failure';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('editor sidebar save failure handling', () => {
  it('returns false when the error is not a storage prompt error', async () => {
    isEditorStoragePromptErrorMock.mockReturnValue(false);

    await expect(
      maybeHandleEditorSaveFailure({
        confirmOpenLibrary: vi.fn(),
        error: new Error('plain failure'),
      })
    ).resolves.toBe(false);
  });
});

describe('editor sidebar storage prompt save failure handling', () => {
  it('opens the library after user confirmation', async () => {
    isEditorStoragePromptErrorMock.mockReturnValue(true);
    const confirmOpenLibrary = vi.fn().mockResolvedValue(true);

    await expect(
      maybeHandleEditorSaveFailure({
        confirmOpenLibrary,
        error: new Error('storage is full'),
      })
    ).resolves.toBe(true);

    expect(confirmOpenLibrary).toHaveBeenCalledWith(
      expect.objectContaining({
        confirmText: 'gallery.app.openLibrary',
        message: 'editor.documentActions.saveToLibraryError. common.errors.storageDetail',
      })
    );
    expect(openGalleryPageMock).toHaveBeenCalledWith();
  });

  it('uses the injected opener and skips navigation when the dialog is cancelled', async () => {
    isEditorStoragePromptErrorMock.mockReturnValue(true);
    const openLibrary = vi.fn().mockResolvedValue(undefined);

    await maybeHandleEditorSaveFailure({
      confirmOpenLibrary: vi.fn().mockResolvedValue(false),
      error: new Error('storage is full'),
      openLibrary,
    });
    await maybeHandleEditorSaveFailure({
      confirmOpenLibrary: vi.fn().mockResolvedValue(true),
      error: new Error('storage is full'),
      openLibrary,
    });

    expect(openGalleryPageMock).toHaveBeenCalledTimes(0);
    expect(openLibrary).toHaveBeenCalledOnce();
  });
});
