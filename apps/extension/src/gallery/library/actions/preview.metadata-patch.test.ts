// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';
import { createController, createMediaItem, runBusyAction } from './test-support/index';
import { createSaveMetadataAction } from './preview';

const { updateMediaLibraryEntrySafelyMock } = vi.hoisted(() => ({
  updateMediaLibraryEntrySafelyMock: vi.fn(),
}));

vi.mock('../../../workflows/media-hub/store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../workflows/media-hub/store')>()),
  updateMediaLibraryEntrySafely: updateMediaLibraryEntrySafelyMock,
}));

vi.mock('../../../composition/persistence/scenario/store/public', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../composition/persistence/scenario/store/public')
  >()),
  updateScenarioProjectRecordMetadata: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

it('saves only changed preview metadata fields for media items', async () => {
  const previewItem = createMediaItem({
    filename: 'capture.png',
    id: 'asset-1',
    tags: ['remote'],
  });
  const { controller } = createController({
    filenameDraft: ' renamed.png ',
    previewItem,
    tagDrafts: ['remote'],
  });

  await createSaveMetadataAction(controller)(runBusyAction);

  expect(updateMediaLibraryEntrySafelyMock).toHaveBeenCalledWith('asset-1', {
    filename: 'renamed.png',
  });
});

it('saves tags only when the preview tag draft changed', async () => {
  const previewItem = createMediaItem({
    filename: 'capture.png',
    id: 'asset-1',
    tags: ['remote'],
  });
  const { controller } = createController({
    filenameDraft: 'capture.png',
    previewItem,
    tagDrafts: ['remote', 'draft'],
  });

  await createSaveMetadataAction(controller)(runBusyAction);

  expect(updateMediaLibraryEntrySafelyMock).toHaveBeenCalledWith('asset-1', {
    tags: ['remote', 'draft'],
  });
});
