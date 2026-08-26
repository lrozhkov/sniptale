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

it('opens a draft recording without narrowing the visible gallery scope', async () => {
  await openLatestRecordingInGallery('recording-draft');

  expect(mocks.openGalleryPage).toHaveBeenCalledWith({ recordingId: 'recording-draft' });
  expect(mocks.getRecording).not.toHaveBeenCalled();
});

it('keeps the default gallery scope without loading recording metadata', async () => {
  await openLatestRecordingInGallery('recording-saved');

  expect(mocks.openGalleryPage).toHaveBeenCalledWith({ recordingId: 'recording-saved' });
  expect(mocks.getRecording).not.toHaveBeenCalled();
});
