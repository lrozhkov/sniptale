// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createController,
  createMediaItem,
  createScenarioItem,
  createVideoProjectItem,
  runBusyAction,
} from './test-support/index';
import { createApplySelectionTagAction, createDeleteManyAction } from './selection';
import { createSelectionBackupAction, createSelectionZipAction } from './selection-export';
import { translate } from '../../../platform/i18n';

const {
  addMediaLibraryEntryTagsSafelyMock,
  deleteMediaLibraryAssetsBatchSafelyMock,
  deletePersistedVideoProjectMock,
  deleteScenarioProjectRecordMock,
  getMediaAssetBlobMock,
  updateScenarioProjectRecordMetadataMock,
} = vi.hoisted(() => ({
  addMediaLibraryEntryTagsSafelyMock: vi.fn(),
  deleteMediaLibraryAssetsBatchSafelyMock: vi.fn(),
  deletePersistedVideoProjectMock: vi.fn(),
  deleteScenarioProjectRecordMock: vi.fn(),
  getMediaAssetBlobMock: vi.fn(),
  updateScenarioProjectRecordMetadataMock: vi.fn(),
}));

vi.mock('../../../workflows/media-hub/store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../workflows/media-hub/store')>()),
  addMediaLibraryEntryTagsSafely: addMediaLibraryEntryTagsSafelyMock,
  deleteMediaLibraryAssetsBatchSafely: deleteMediaLibraryAssetsBatchSafelyMock,
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
  })
);

describe('gallery app action no-op branches', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('skips confirm dialogs and storage work when delete targets are empty', async () => {
    const { controller, getConfirmDialog } = createController();

    await createDeleteManyAction(controller)([], runBusyAction);

    expect(getConfirmDialog()).toBeNull();
    expect(deleteMediaLibraryAssetsBatchSafelyMock).not.toHaveBeenCalled();
  });

  it('skips zip and tag updates when selection state is missing', async () => {
    const { controller, getState } = createController({
      selectedItems: [],
      selectionTagDraft: 'existing',
    });

    await createSelectionBackupAction(controller)(runBusyAction);
    await createSelectionZipAction(controller)(runBusyAction);
    await createApplySelectionTagAction(controller)(runBusyAction);

    expect(getMediaAssetBlobMock).not.toHaveBeenCalled();
    expect(getState().selection.selectionTagDraft).toBe('existing');
  });
});

describe('gallery app selection delete flows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes selected media, scenarios, and video projects through their lifecycle owners', async () => {
    const mediaItem = createMediaItem({ entityId: 'asset-1', id: 'asset-1' });
    const scenarioItem = createScenarioItem({ entityId: 'scenario-1', id: 'scenario:scenario-1' });
    const videoProjectItem = createVideoProjectItem({
      entityId: 'video-project-1',
      id: 'video-project:video-project-1',
    });
    const selectedItems = [mediaItem, scenarioItem, videoProjectItem];
    const { controller, getConfirmDialog, getState } = createController({
      previewItem: mediaItem,
      selectedIds: new Set(selectedItems.map((item) => item.id)),
      selectedItems,
    });

    await createDeleteManyAction(controller)(selectedItems, runBusyAction);
    const confirmDialog = getConfirmDialog();
    expect(confirmDialog).toMatchObject({
      message: translate('gallery.app.deleteSelectedConfirm'),
      title: translate('gallery.app.deleteConfirmTitle'),
    });
    expect(confirmDialog?.message).not.toMatch(/\d+\s+элемент/);
    await confirmDialog?.onConfirm();

    expect(deleteMediaLibraryAssetsBatchSafelyMock).toHaveBeenCalledWith(['asset-1']);
    expect(deleteScenarioProjectRecordMock).toHaveBeenCalledWith('scenario-1');
    expect(deletePersistedVideoProjectMock).toHaveBeenCalledWith('video-project-1');
    expect(getState().selection.selectedIds.size).toBe(0);
    expect(getState().preview.session.item).toBeNull();
    expect(controller.actions.storage.refresh).toHaveBeenCalledTimes(1);
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
        createMediaItem({ entityId: 'asset-2', tags: ['demo'] }),
        createScenarioItem({ entityId: 'scenario-1', tags: [] }),
      ],
      selectionTagDraft: ' demo ',
    });

    await createApplySelectionTagAction(controller)(runBusyAction);

    expect(addMediaLibraryEntryTagsSafelyMock).toHaveBeenCalledWith('asset-1', ['demo']);
    expect(addMediaLibraryEntryTagsSafelyMock).toHaveBeenCalledTimes(1);
    expect(updateScenarioProjectRecordMetadataMock).toHaveBeenCalledWith('scenario-1', {
      tags: ['demo'],
    });
    expect(getState().selection.selectionTagDraft).toBe('');
    expect(controller.actions.storage.refresh).toHaveBeenCalledTimes(1);
  });

  it('applies the tag selected from suggestions instead of the stale input draft', async () => {
    const { controller } = createController({
      selectedItems: [createMediaItem({ entityId: 'asset-1', tags: [] })],
      selectionTagDraft: 'stale draft',
    });

    await createApplySelectionTagAction(controller)(runBusyAction, 'existing-tag');

    expect(addMediaLibraryEntryTagsSafelyMock).toHaveBeenCalledWith('asset-1', ['existing-tag']);
  });

  it('starts independent selection tag updates before either update completes', async () => {
    let firstStarted = false;
    let secondStarted = false;
    let resolveFirstUpdate!: () => void;
    const firstUpdateGate = new Promise<void>((resolve) => {
      resolveFirstUpdate = resolve;
    });

    addMediaLibraryEntryTagsSafelyMock.mockImplementation((assetId: string) => {
      if (assetId === 'asset-1') {
        firstStarted = true;
        return firstUpdateGate;
      }

      secondStarted = true;
      return Promise.resolve();
    });

    const { controller } = createController({
      selectedItems: [
        createMediaItem({ entityId: 'asset-1', tags: [] }),
        createMediaItem({ entityId: 'asset-2', tags: [] }),
      ],
      selectionTagDraft: 'batch-tag',
    });

    const pending = createApplySelectionTagAction(controller)(runBusyAction);
    await Promise.resolve();

    expect(firstStarted).toBe(true);
    expect(secondStarted).toBe(true);

    resolveFirstUpdate();
    await pending;
  });
});
