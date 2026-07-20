// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createCleanupGroup,
  createController,
  createMediaItem,
  createScenarioItem,
  createVideoProjectItem,
  runBusyAction,
} from './test-support/index';
import {
  createApplySelectionTagAction,
  createDeleteManyAction,
  createSaveMetadataAction,
  createSelectionZipAction,
  createStorageCleanupAction,
} from './helpers';

const {
  addMediaLibraryEntryTagsSafelyMock,
  deleteMediaLibraryAssetsBatchSafelyMock,
  deletePersistedVideoProjectMock,
  deleteScenarioProjectRecordMock,
  deleteStorageCleanupCandidatesSafelyMock,
  getMediaAssetBlobMock,
  getMediaLibraryEntryMock,
  updateScenarioProjectRecordMetadataMock,
  updateMediaLibraryEntrySafelyMock,
} = vi.hoisted(() => ({
  addMediaLibraryEntryTagsSafelyMock: vi.fn(),
  deleteMediaLibraryAssetsBatchSafelyMock: vi.fn(),
  deletePersistedVideoProjectMock: vi.fn(),
  deleteScenarioProjectRecordMock: vi.fn(),
  deleteStorageCleanupCandidatesSafelyMock: vi.fn(),
  getMediaAssetBlobMock: vi.fn(),
  getMediaLibraryEntryMock: vi.fn(),
  updateScenarioProjectRecordMetadataMock: vi.fn(),
  updateMediaLibraryEntrySafelyMock: vi.fn(),
}));

vi.mock('../../../workflows/media-hub/store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../workflows/media-hub/store')>()),
  addMediaLibraryEntryTagsSafely: addMediaLibraryEntryTagsSafelyMock,
  deleteMediaLibraryAssetsBatchSafely: deleteMediaLibraryAssetsBatchSafelyMock,
  deleteStorageCleanupCandidatesSafely: deleteStorageCleanupCandidatesSafelyMock,
  updateMediaLibraryEntrySafely: updateMediaLibraryEntrySafelyMock,
}));

vi.mock('../../../workflows/media-hub/video-projects', () => ({
  deletePersistedVideoProject: deletePersistedVideoProjectMock,
}));

vi.mock('../../../composition/persistence/scenario/store/public', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../composition/persistence/scenario/store/public')
  >()),
  deleteScenarioProjectRecord: deleteScenarioProjectRecordMock,
  updateScenarioProjectRecordMetadata: updateScenarioProjectRecordMetadataMock,
}));

vi.mock(
  '../../../composition/persistence/media-library/index.library.ts',
  async (importOriginal) => ({
    ...(await importOriginal()),
    getMediaAssetBlob: getMediaAssetBlobMock,
    getMediaLibraryEntry: getMediaLibraryEntryMock,
  })
);

describe('gallery app action no-op branches', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('skips confirm dialogs and storage work when delete or cleanup targets are empty', async () => {
    const { controller, getConfirmDialog } = createController();

    await createDeleteManyAction(controller)([], runBusyAction);
    await createStorageCleanupAction(controller)(createCleanupGroup({ items: [] }), runBusyAction);

    expect(getConfirmDialog()).toBeNull();
    expect(deleteMediaLibraryAssetsBatchSafelyMock).not.toHaveBeenCalled();
    expect(deleteStorageCleanupCandidatesSafelyMock).not.toHaveBeenCalled();
  });

  it('skips zip, metadata, and tag updates when selection or preview state is missing', async () => {
    const { controller, getState } = createController({
      selectedItems: [],
      selectionTagDraft: 'existing',
    });

    await createSelectionZipAction(controller)(runBusyAction);
    await createSaveMetadataAction(controller)(runBusyAction);
    await createApplySelectionTagAction(controller)(runBusyAction);

    expect(getMediaAssetBlobMock).not.toHaveBeenCalled();
    expect(getMediaLibraryEntryMock).not.toHaveBeenCalled();
    expect(updateMediaLibraryEntrySafelyMock).not.toHaveBeenCalled();
    expect(getState().selection.selectionTagDraft).toBe('existing');
  });
});

describe('gallery app selection cleanup and delete flows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes selected media, scenarios, and video projects through their lifecycle owners', async () => {
    const { controller, getConfirmDialog } = createController();
    const mediaItem = createMediaItem({ entityId: 'asset-1', id: 'asset-1' });
    const scenarioItem = createScenarioItem({ entityId: 'scenario-1', id: 'scenario:scenario-1' });
    const videoProjectItem = createVideoProjectItem({
      entityId: 'video-project-1',
      id: 'video-project:video-project-1',
    });

    await createDeleteManyAction(controller)(
      [mediaItem, scenarioItem, videoProjectItem],
      runBusyAction
    );
    await getConfirmDialog()?.onConfirm();

    expect(deleteMediaLibraryAssetsBatchSafelyMock).toHaveBeenCalledWith(['asset-1']);
    expect(deleteScenarioProjectRecordMock).toHaveBeenCalledWith('scenario-1');
    expect(deletePersistedVideoProjectMock).toHaveBeenCalledWith('video-project-1');
  });

  it('passes typed cleanup candidates to the storage cleanup lifecycle owner', async () => {
    const { controller, getConfirmDialog } = createController();
    const group = createCleanupGroup({
      items: [
        {
          createdAt: 1,
          filename: 'orphan.bin',
          id: 'orphan-1',
          kind: 'recording',
          size: 10,
          target: 'recording',
        },
      ],
    });

    await createStorageCleanupAction(controller)(group, runBusyAction);
    await getConfirmDialog()?.onConfirm();

    expect(deleteStorageCleanupCandidatesSafelyMock).toHaveBeenCalledWith(group.items);
  });
});

describe('gallery app selection metadata and archive flows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('applies selection tags to media, scenarios, and video projects', async () => {
    const { controller, getState } = createController({
      selectedItems: [
        createMediaItem({ entityId: 'asset-1', tags: [] }),
        createScenarioItem({ entityId: 'scenario-1', tags: [] }),
      ],
      selectionTagDraft: ' demo ',
    });

    await createApplySelectionTagAction(controller)(runBusyAction);

    expect(addMediaLibraryEntryTagsSafelyMock).toHaveBeenCalledWith('asset-1', ['demo']);
    expect(updateScenarioProjectRecordMetadataMock).toHaveBeenCalledWith('scenario-1', {
      tags: ['demo'],
    });
    expect(getState().selection.selectionTagDraft).toBe('');
  });
});
