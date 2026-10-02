// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';
import {
  createController,
  createMediaItem,
  createScenarioExportItem,
  runBusyAction,
} from './test-support/index';
import { createClosePreviewAction, createSaveMetadataAction, resetPreviewChanges } from './preview';
import {
  createNavigatePreviewAction,
  createPreviewNavigationCoordinator,
} from './preview-navigation';

const { updateMediaLibraryEntrySafelyMock, renameExportMock, updateProjectMock } = vi.hoisted(
  () => ({
    updateMediaLibraryEntrySafelyMock: vi.fn(),
    renameExportMock: vi.fn(),
    updateProjectMock: vi.fn(),
  })
);

vi.mock('../../../workflows/media-hub/store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../workflows/media-hub/store')>()),
  updateMediaLibraryEntrySafely: updateMediaLibraryEntrySafelyMock,
}));

vi.mock('../../../composition/persistence/scenario/store/public', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../composition/persistence/scenario/store/public')
  >()),
  updateScenarioProjectRecordMetadata: updateProjectMock,
}));

vi.mock('../../../composition/persistence/scenario/store/project-records/exports', () => ({
  renameScenarioHtmlExportRecord: renameExportMock,
}));

beforeEach(() => {
  vi.clearAllMocks();
  renameExportMock.mockReset();
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

it('saves only the selected HTML export name, preserving project metadata and tags', async () => {
  const item = createScenarioExportItem({ tags: ['source'], filename: 'old.html' });
  const { controller } = createController({
    previewItem: item,
    filenameDraft: ' New ',
    tagDrafts: ['other'],
  });
  await createSaveMetadataAction(controller)(runBusyAction);
  expect(renameExportMock).toHaveBeenCalledWith(item.entityId, 'New.html');
  expect(updateProjectMock).not.toHaveBeenCalled();
  expect(updateMediaLibraryEntrySafelyMock).not.toHaveBeenCalled();
  expect(item.filename).toBe('old.html');
  expect(item.tags).toEqual(['source']);
});

it('cancels the export rename through the existing draft reset', () => {
  const item = createScenarioExportItem({ filename: 'old.html' });
  const { controller } = createController({ previewItem: item, filenameDraft: 'New' });
  resetPreviewChanges(controller);
  expect(controller.state.preview.draft.filename).toBe('old.html');
  expect(renameExportMock).not.toHaveBeenCalled();
});

it('keeps the selected export open and propagates a failed save on close', async () => {
  const item = createScenarioExportItem({ filename: 'old.html' });
  const { controller } = createController({ previewItem: item, filenameDraft: 'New' });
  renameExportMock.mockRejectedValueOnce(new Error('quota'));
  await expect(createClosePreviewAction(controller)(runBusyAction)).rejects.toThrow('quota');
  expect(controller.state.preview.session.item?.id).toBe(item.id);
  expect(controller.state.preview.draft.filename).toBe('New');
  await createClosePreviewAction(controller)(runBusyAction);
  expect(controller.state.preview.session.item).toBeNull();
  expect(renameExportMock).toHaveBeenLastCalledWith(item.entityId, 'New.html');
});

it('uses the normalized name as the navigation baseline and avoids duplicate writes', async () => {
  const item = createScenarioExportItem({ filename: 'old.html' });
  const target = createMediaItem({ id: 'next' });
  const { controller } = createController({ previewItem: item, filenameDraft: 'New' });
  const coordinator = createPreviewNavigationCoordinator();
  await createNavigatePreviewAction(controller, coordinator)(target, runBusyAction);
  expect(coordinator.lastPersisted?.filename).toBe('New.html');
  expect(renameExportMock).toHaveBeenCalledOnce();
  expect(controller.state.preview.session.item?.id).toBe(target.id);
});
