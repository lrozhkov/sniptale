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
import type { MediaAssetProjectUsage } from '../../../composition/persistence/media-library/usage';

const deleteExportMock = vi.hoisted(() => vi.fn());

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
  permanentlyDeleteLibraryItem: async (
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
    else if (entry.target.kind === 'video-project')
      await deletePersistedVideoProjectMock(entry.target.id);
    else await deleteExportMock(entry.target.id);
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

it('restores only the deleted scenario-export catalogue', async () => {
  const { controller } = createController();
  const exportItem = createScenarioExportItem();
  const restored = await createRestoreTrashAction(controller)([exportItem], runBusyAction);
  expect(restored).toBe(true);
  expect(restoreLibraryTrashItemsMock).toHaveBeenCalledWith([
    { kind: 'scenario-export', id: exportItem.entityId },
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

describe('unified Gallery deletion requests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listMediaAssetProjectUsageMock.mockResolvedValue([]);
  });
  it('opens one choice and moves to Trash without a second dialog or dependency mutation', async () => {
    const { controller } = createController();
    const item = createMediaItem({ entityId: 'source' });
    await createDeleteManyAction(controller)([item], runBusyAction);
    expect(controller.state.storage.confirmDialog).toBeNull();
    expect(moveLibraryItemsToTrashMock).not.toHaveBeenCalled();
    expect(listMediaAssetProjectUsageMock).not.toHaveBeenCalled();
    const request = controller.state.storage.deletionRequest;
    expect(request).not.toBeNull();
    await request!.moveToTrash!();
    expect(moveLibraryItemsToTrashMock).toHaveBeenCalledExactlyOnceWith([
      { kind: 'media', id: 'source' },
    ]);
    expect(deleteMediaLibraryAssetsBatchSafelyMock).not.toHaveBeenCalled();
  });
  it('warns about secondary references before explicitly confirmed permanent deletion', async () => {
    const usage = { id: 'video-1', kind: 'video' as const, name: 'Montage', primary: false };
    listMediaAssetProjectUsageMock.mockResolvedValueOnce([usage]);
    const { controller } = createController();
    const media = createMediaItem({ entityId: 'asset-1' });
    await createDeleteManyAction(controller)([media], runBusyAction);
    const prepared = await controller.state.storage.deletionRequest!.preparePermanent();
    expect(prepared?.warning).toContain('Montage');
    expect(deleteMediaLibraryAssetsBatchSafelyMock).not.toHaveBeenCalled();
    expect(moveLibraryItemsToTrashMock).not.toHaveBeenCalled();
    await prepared!.confirm();
    expect(deleteMediaLibraryAssetsBatchSafelyMock).toHaveBeenCalledWith(
      ['asset-1'],
      new Map([['asset-1', [usage]]])
    );
  });
  it('blocks primary dependencies outside a confirmed bulk selection before any deletion', async () => {
    listMediaAssetProjectUsageMock.mockResolvedValueOnce([
      { kind: 'video', id: 'included', name: 'Included', primary: true },
      { kind: 'video', id: 'outside', name: 'Outside', primary: true },
    ]);
    const { controller } = createController();
    await createDeleteManyAction(controller)(
      [
        createMediaItem({ entityId: 'recording' }),
        createVideoProjectItem({ entityId: 'included' }),
      ],
      runBusyAction
    );
    await expect(controller.state.storage.deletionRequest!.preparePermanent()).rejects.toThrow(
      'Outside'
    );
    expect(deletePersistedVideoProjectMock).not.toHaveBeenCalled();
    expect(deleteMediaLibraryAssetsBatchSafelyMock).not.toHaveBeenCalled();
  });
  it('deletes confirmed project roots before media and excludes their removed primary references', async () => {
    listMediaAssetProjectUsageMock.mockResolvedValueOnce([
      { kind: 'video', id: 'primary', name: 'Primary', primary: true },
    ]);
    const lifecycle = { storageClass: 'library' as const, savedAt: 1, updatedAt: 1, trashedAt: 2 };
    const selected = [
      createMediaItem({ entityId: 'recording', lifecycle }),
      { ...createVideoProjectItem({ entityId: 'primary' }), lifecycle },
      { ...createScenarioItem({ entityId: 'guide' }), lifecycle },
    ];
    const { controller } = createController({ selectedItems: selected, previewItem: selected[0]! });
    await createDeleteManyAction(controller)(selected, runBusyAction);
    expect(controller.state.storage.deletionRequest!.moveToTrash).toBeNull();
    const prepared = await controller.state.storage.deletionRequest!.preparePermanent();
    await prepared!.confirm();
    expect(deleteScenarioProjectRecordMock).toHaveBeenCalledWith('guide');
    expect(deletePersistedVideoProjectMock).toHaveBeenCalledWith('primary');
    expect(deleteMediaLibraryAssetsBatchSafelyMock).toHaveBeenCalledWith(
      ['recording'],
      new Map([['recording', []]])
    );
    expect(deletePersistedVideoProjectMock.mock.invocationCallOrder[0]).toBeLessThan(
      deleteMediaLibraryAssetsBatchSafelyMock.mock.invocationCallOrder[0]!
    );
    expect(controller.state.preview.session.item).toBeNull();
    expect(controller.actions.storage.refresh).toHaveBeenCalledOnce();
  });
  it('preserves the selection and preview after a failed reversible move', async () => {
    const item = createMediaItem({ id: 'source' });
    const { controller } = createController({
      previewItem: item,
      selectedIds: new Set(['source']),
    });
    moveLibraryItemsToTrashMock.mockRejectedValueOnce(new Error('quota'));
    await createDeleteManyAction(controller)([item], runBusyAction);
    await expect(controller.state.storage.deletionRequest!.moveToTrash!()).rejects.toThrow('quota');
    expect(controller.state.preview.session.item).toEqual(item);
    expect(controller.state.selection.selectedIds.has('source')).toBe(true);
  });
  it('invalidates prepared deletion when the current material changes', async () => {
    const item = createMediaItem({ id: 'first' });
    const { controller } = createController({ selectedItems: [item] });
    await createDeleteManyAction(controller)([item], runBusyAction);
    const prepared = await controller.state.storage.deletionRequest!.preparePermanent();
    controller.state.selection.selectedItems = [createMediaItem({ id: 'second' })];
    expect(await prepared!.confirm()).toBe(false);
    expect(deleteMediaLibraryAssetsBatchSafelyMock).not.toHaveBeenCalled();
  });
});

it('discards prepared deletion after closing the choice even if the selection stays unchanged', async () => {
  vi.clearAllMocks();
  const { controller } = createController();
  await createDeleteManyAction(controller)([createMediaItem()], runBusyAction);
  const prepared = await controller.state.storage.deletionRequest!.preparePermanent();
  controller.actions.surface.setDeletionRequest(null);
  expect(await prepared!.confirm()).toBe(false);
  expect(deleteMediaLibraryAssetsBatchSafelyMock).not.toHaveBeenCalled();
});

it('refreshes actual committed state after a later bulk deletion fails', async () => {
  vi.clearAllMocks();
  const { controller } = createController();
  deleteMediaLibraryAssetsBatchSafelyMock.mockRejectedValueOnce(new Error('media failed'));
  await createDeleteManyAction(controller)(
    [
      createScenarioItem({ entityId: 'committed-guide' }),
      createMediaItem({ entityId: 'failed-media' }),
    ],
    runBusyAction
  );
  const prepared = await controller.state.storage.deletionRequest!.preparePermanent();
  await expect(prepared!.confirm()).rejects.toThrow('media failed');
  expect(deleteScenarioProjectRecordMock).toHaveBeenCalledWith('committed-guide');
  expect(controller.actions.storage.refresh).toHaveBeenCalledOnce();
});

it('deletes a selected export independently and subsumes catalogue children in a parent batch', async () => {
  vi.clearAllMocks();
  const item = createScenarioExportItem();
  const { controller } = createController();
  await createDeleteManyAction(controller)([item], runBusyAction);
  await (await controller.state.storage.deletionRequest!.preparePermanent())!.confirm();
  expect(deleteExportMock).toHaveBeenCalledExactlyOnceWith(item.entityId);
  expect(deleteScenarioProjectRecordMock).not.toHaveBeenCalled();
  vi.clearAllMocks();
  await createDeleteManyAction(controller)(
    [item, createScenarioItem({ entityId: item.project.id })],
    runBusyAction
  );
  await (await controller.state.storage.deletionRequest!.preparePermanent())!.confirm();
  expect(deleteScenarioProjectRecordMock).toHaveBeenCalledExactlyOnceWith(item.project.id);
  expect(deleteExportMock).not.toHaveBeenCalled();
});
