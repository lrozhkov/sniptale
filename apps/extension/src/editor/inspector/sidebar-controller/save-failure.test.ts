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
        confirmOpenStorageManager: vi.fn(),
        error: new Error('plain failure'),
      })
    ).resolves.toBe(false);
  });
});

describe('editor sidebar storage prompt save failure handling', () => {
  it('opens the gallery storage manager after user confirmation', async () => {
    isEditorStoragePromptErrorMock.mockReturnValue(true);
    const confirmOpenStorageManager = vi.fn().mockResolvedValue(true);

    await expect(
      maybeHandleEditorSaveFailure({
        confirmOpenStorageManager,
        error: new Error('storage is full'),
      })
    ).resolves.toBe(true);

    expect(confirmOpenStorageManager).toHaveBeenCalledWith(
      expect.objectContaining({
        confirmText: 'gallery.app.openStorageManager',
        message: 'storage is full\n\ngallery.app.openStorageManager?',
      })
    );
    expect(openGalleryPageMock).toHaveBeenCalledWith({ openStorageManager: true });
  });

  it('uses the injected opener and skips navigation when the dialog is cancelled', async () => {
    isEditorStoragePromptErrorMock.mockReturnValue(true);
    const openStorageManager = vi.fn().mockResolvedValue(undefined);

    await maybeHandleEditorSaveFailure({
      confirmOpenStorageManager: vi.fn().mockResolvedValue(false),
      error: new Error('storage is full'),
      openStorageManager,
    });
    await maybeHandleEditorSaveFailure({
      confirmOpenStorageManager: vi.fn().mockResolvedValue(true),
      error: new Error('storage is full'),
      openStorageManager,
    });

    expect(openGalleryPageMock).toHaveBeenCalledTimes(0);
    expect(openStorageManager).toHaveBeenCalledOnce();
  });
});
