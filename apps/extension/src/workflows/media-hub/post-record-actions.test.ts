import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getRecording: vi.fn(),
  openGalleryPage: vi.fn(),
}));

vi.mock('../../composition/persistence/recordings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../composition/persistence/recordings')>()),
  getRecording: mocks.getRecording,
}));

vi.mock('../../platform/navigation/extension-pages', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/navigation/extension-pages')>()),
  openGalleryPage: mocks.openGalleryPage,
}));

import { openLatestRecordingInGallery } from './post-record-actions';

beforeEach(() => {
  mocks.getRecording.mockReset();
  mocks.openGalleryPage.mockReset();
});

it('opens a draft recording in the temporary gallery scope', async () => {
  mocks.getRecording.mockResolvedValue({
    lifecycle: { savedAt: null, storageClass: 'temporary', updatedAt: 1 },
  });

  await openLatestRecordingInGallery('recording-draft');

  expect(mocks.openGalleryPage).toHaveBeenCalledWith({
    recordingId: 'recording-draft',
    scope: 'temporary',
  });
});

it('keeps the default gallery scope when lifecycle metadata is unavailable', async () => {
  mocks.getRecording.mockResolvedValue(undefined);

  await openLatestRecordingInGallery('recording-saved');

  expect(mocks.openGalleryPage).toHaveBeenCalledWith({ recordingId: 'recording-saved' });
});
