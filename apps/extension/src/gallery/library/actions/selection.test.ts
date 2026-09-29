// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createController,
  createMediaItem,
  createScenarioExportItem,
  createScenarioItem,
  createVideoProjectItem,
  runBusyAction,
} from './test-support/index';
import {
  createApplySelectionTagAction,
  createDeleteManyAction,
  createRestoreTrashAction,
} from './selection';
import { createSelectionBackupAction, createSelectionZipAction } from './selection-export';
import { translate } from '../../../platform/i18n';
import type { MediaAssetProjectUsage } from '../../../composition/persistence/media-library/usage';

const {
  moveLibraryItemsToTrashMock,
  restoreLibraryTrashItemsMock,
  addMediaLibraryEntryTagsSafelyMock,
  deleteMediaLibraryAssetsBatchSafelyMock,
  deletePersistedVideoProjectMock,
  deleteScenarioProjectRecordMock,
  getMediaAssetBlobMock,
  listMediaAssetProjectUsageMock,
  updateScenarioProjectRecordMetadataMock,
} = vi.hoisted(() => ({
  moveLibraryItemsToTrashMock: vi.fn(),
  restoreLibraryTrashItemsMock: vi.fn(),
  addMediaLibraryEntryTagsSafelyMock: vi.fn(),
  deleteMediaLibraryAssetsBatchSafelyMock: vi.fn(),
  deletePersistedVideoProjectMock: vi.fn(),
  deleteScenarioProjectRecordMock: vi.fn(),
  getMediaAssetBlobMock: vi.fn(),
  listMediaAssetProjectUsageMock: vi.fn(async (): Promise<MediaAssetProjectUsage[]> => []),
  updateScenarioProjectRecordMetadataMock: vi.fn(),
}));

vi.mock('../../../workflows/media-hub/trash', () => ({
  moveLibraryItemsToTrash: moveLibraryItemsToTrashMock,
  restoreLibraryTrashItems: restoreLibraryTrashItemsMock,
  permanentlyDeleteTrashItem: async (
    entry: { target: { kind: string; id: string } },
    expectedUsage: MediaAssetProjectUsage[]
  ) => {
    if (entry.target.kind === 'media')
      await deleteMediaLibraryAssetsBatchSafelyMock(
        [entry.target.id],
        new Map([[entry.target.id, expectedUsage]])
      );
    else if (entry.target.kind === 'scenario-project')
      await deleteScenarioProjectRecordMock(entry.target.id);
    else await deletePersistedVideoProjectMock(entry.target.id);
  },
}));

vi.mock('../../../composition/persistence/media-library/usage', () => ({
  listMediaAssetProjectUsage: listMediaAssetProjectUsageMock,
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

  it('warns about a linked project before deleting its material', async () => {
    listMediaAssetProjectUsageMock.mockResolvedValueOnce([
      { id: 'video-1', kind: 'video', name: 'Montage', primary: false },
    ]);
    const mediaItem = createMediaItem({
      entityId: 'asset-1',
      id: 'asset-1',
      lifecycle: { storageClass: 'library', savedAt: 1, updatedAt: 1, trashedAt: 2 },
    });
    const { controller, getConfirmDialog } = createController();
    await createDeleteManyAction(controller)([mediaItem], runBusyAction);
    const dialog = getConfirmDialog();
    expect(dialog?.message).toContain('Montage');
    expect(deleteMediaLibraryAssetsBatchSafelyMock).not.toHaveBeenCalled();
    await dialog?.onConfirm();
    expect(deleteMediaLibraryAssetsBatchSafelyMock).toHaveBeenCalledWith(
      ['asset-1'],
      new Map([['asset-1', [{ id: 'video-1', kind: 'video', name: 'Montage', primary: false }]]])
    );
  });

  it('blocks a file required as a primary project source', async () => {
    listMediaAssetProjectUsageMock.mockResolvedValueOnce([
      { id: 'video-1', kind: 'video', name: 'Montage', primary: true },
    ]);
    const mediaItem = createMediaItem({
      entityId: 'asset-1',
      id: 'asset-1',
      lifecycle: { storageClass: 'library', savedAt: 1, updatedAt: 1, trashedAt: 2 },
    });
    const { controller, getConfirmDialog } = createController();
    await createDeleteManyAction(controller)([mediaItem], runBusyAction);
    expect(getConfirmDialog()?.message).toContain('Montage');
    await getConfirmDialog()?.onConfirm();
    expect(deleteMediaLibraryAssetsBatchSafelyMock).not.toHaveBeenCalled();
  });

  it('deletes selected media, scenarios, and video projects through their lifecycle owners', async () => {
    const mediaItem = createMediaItem({
      entityId: 'asset-1',
      id: 'asset-1',
      lifecycle: { storageClass: 'library', savedAt: 1, updatedAt: 1, trashedAt: 2 },
    });
    const scenarioItem = createScenarioItem({
      entityId: 'scenario-1',
      id: 'scenario:scenario-1',
      lifecycle: { storageClass: 'library', savedAt: 1, updatedAt: 1, trashedAt: 2 },
    });
    const videoProjectItem = createVideoProjectItem({
      entityId: 'video-project-1',
      id: 'video-project:video-project-1',
      lifecycle: { storageClass: 'library', savedAt: 1, updatedAt: 1, trashedAt: 2 },
    });
    scenarioItem.lifecycle = { storageClass: 'library', savedAt: 1, updatedAt: 1, trashedAt: 2 };
    videoProjectItem.lifecycle = {
      storageClass: 'library',
      savedAt: 1,
      updatedAt: 1,
      trashedAt: 2,
    };
    const selectedItems = [mediaItem, scenarioItem, videoProjectItem];
    const { controller, getConfirmDialog, getState } = createController({
      previewItem: mediaItem,
      selectedIds: new Set(selectedItems.map((item) => item.id)),
      selectedItems,
    });

    await createDeleteManyAction(controller)(selectedItems, runBusyAction);
    const confirmDialog = getConfirmDialog();
    expect(confirmDialog).toMatchObject({
      message: translate('gallery.app.permanentDeleteConfirm'),
      title: translate('gallery.app.permanentDelete'),
    });
    expect(confirmDialog?.message).not.toMatch(/\d+\s+элемент/);
    await confirmDialog?.onConfirm();

    expect(deleteMediaLibraryAssetsBatchSafelyMock).toHaveBeenCalledWith(
      ['asset-1'],
      new Map([['asset-1', []]])
    );
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

it('ordinary deletion confirms a reversible move without inspecting or detaching project usage', async () => {
  vi.clearAllMocks();
  const { controller, getConfirmDialog } = createController();
  const item = createMediaItem({ entityId: 'source' });
  await createDeleteManyAction(controller)([item], runBusyAction);
  expect(moveLibraryItemsToTrashMock).not.toHaveBeenCalled();
  expect(listMediaAssetProjectUsageMock).not.toHaveBeenCalled();
  expect(getConfirmDialog()?.title).toBe(translate('gallery.app.moveToTrash'));
  await getConfirmDialog()?.onConfirm();
  expect(moveLibraryItemsToTrashMock).toHaveBeenCalledWith([{ kind: 'media', id: 'source' }]);
  expect(deleteMediaLibraryAssetsBatchSafelyMock).not.toHaveBeenCalled();
});

it('failed move preserves selection and preview for retry', async () => {
  const item = createMediaItem({ id: 'source' });
  const { controller, getConfirmDialog, getState } = createController({
    previewItem: item,
    selectedIds: new Set(['source']),
  });
  moveLibraryItemsToTrashMock.mockRejectedValueOnce(new Error('quota'));
  await createDeleteManyAction(controller)([item], runBusyAction);
  await expect(getConfirmDialog()?.onConfirm()).rejects.toThrow('quota');
  expect(getState().preview.session.item).toEqual(item);
  expect(getState().selection.selectedIds.has('source')).toBe(true);
});

it('restores selected aggregate targets and refreshes the current view', async () => {
  const { controller } = createController();
  const restored = await createRestoreTrashAction(controller)(
    [createScenarioItem({ entityId: 'guide' })],
    runBusyAction
  );
  expect(restored).toBe(true);
  expect(restoreLibraryTrashItemsMock).toHaveBeenCalledWith([
    { kind: 'scenario-project', id: 'guide' },
  ]);
  expect(controller.actions.storage.refresh).toHaveBeenCalled();
});

it('restores a deleted scenario export through its owning project', async () => {
  const { controller } = createController();
  const exportItem = createScenarioExportItem();
  const restored = await createRestoreTrashAction(controller)([exportItem], runBusyAction);
  expect(restored).toBe(true);
  expect(restoreLibraryTrashItemsMock).toHaveBeenCalledWith([
    { kind: 'scenario-project', id: exportItem.project.id },
  ]);
});

it('reports a swallowed restore failure so the preview can show retry feedback', async () => {
  const item = createMediaItem({ entityId: 'deleted' });
  const { controller, getState } = createController({ previewItem: item });
  restoreLibraryTrashItemsMock.mockRejectedValueOnce(new Error('storage failure'));
  const restored = await createRestoreTrashAction(controller)([item], async (action) => {
    await action().catch(() => undefined);
  });
  expect(restored).toBe(false);
  expect(getState().preview.session.item).toEqual(item);
  expect(controller.actions.storage.refresh).not.toHaveBeenCalled();
});

it('empties primary media and its confirmed project in project-first order', async () => {
  vi.clearAllMocks();
  const lifecycle = { storageClass: 'library' as const, savedAt: 1, updatedAt: 1, trashedAt: 2 };
  const media = createMediaItem({ entityId: 'recording', lifecycle });
  const project = { ...createVideoProjectItem({ entityId: 'primary' }), lifecycle };
  listMediaAssetProjectUsageMock.mockResolvedValueOnce([
    { kind: 'video', id: 'primary', name: 'Primary', primary: true },
  ]);
  const { controller, getConfirmDialog } = createController();
  await createDeleteManyAction(controller)([media, project], runBusyAction);
  expect(getConfirmDialog()?.title).toBe(translate('gallery.app.permanentDelete'));
  await getConfirmDialog()?.onConfirm();
  expect(deletePersistedVideoProjectMock).toHaveBeenCalledWith('primary');
  expect(deleteMediaLibraryAssetsBatchSafelyMock).toHaveBeenCalledWith(
    ['recording'],
    new Map([['recording', []]])
  );
  expect(deletePersistedVideoProjectMock.mock.invocationCallOrder[0]).toBeLessThan(
    deleteMediaLibraryAssetsBatchSafelyMock.mock.invocationCallOrder[0]!
  );
});

it('still blocks emptying media required by a project outside the confirmed batch', async () => {
  vi.clearAllMocks();
  const lifecycle = { storageClass: 'library' as const, savedAt: 1, updatedAt: 1, trashedAt: 2 };
  const media = createMediaItem({ entityId: 'recording', lifecycle });
  const project = { ...createVideoProjectItem({ entityId: 'included' }), lifecycle };
  listMediaAssetProjectUsageMock.mockResolvedValueOnce([
    { kind: 'video', id: 'included', name: 'Included', primary: true },
    { kind: 'video', id: 'outside', name: 'Outside', primary: true },
  ]);
  const { controller, getConfirmDialog } = createController();
  await createDeleteManyAction(controller)([media, project], runBusyAction);
  expect(getConfirmDialog()?.message).toContain('Outside');
  await getConfirmDialog()?.onConfirm();
  expect(deletePersistedVideoProjectMock).not.toHaveBeenCalled();
  expect(deleteMediaLibraryAssetsBatchSafelyMock).not.toHaveBeenCalled();
});
