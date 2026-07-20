// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createCleanupGroup,
  createController,
  createMediaItem,
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
  deleteOrphanedRawRecordingsSafelyMock,
  deleteStorageCleanupCandidatesSafelyMock,
  updateMediaLibraryEntrySafelyMock,
  getMediaAssetBlobMock,
} = vi.hoisted(() => ({
  addMediaLibraryEntryTagsSafelyMock: vi.fn(),
  deleteMediaLibraryAssetsBatchSafelyMock: vi.fn(),
  deleteOrphanedRawRecordingsSafelyMock: vi.fn(),
  deleteStorageCleanupCandidatesSafelyMock: vi.fn(),
  updateMediaLibraryEntrySafelyMock: vi.fn(),
  getMediaAssetBlobMock: vi.fn(),
}));

vi.mock('../../../workflows/media-hub/store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../workflows/media-hub/store')>()),
  addMediaLibraryEntryTagsSafely: addMediaLibraryEntryTagsSafelyMock,
  deleteMediaLibraryAssetsBatchSafely: deleteMediaLibraryAssetsBatchSafelyMock,
  deleteOrphanedRawRecordingsSafely: deleteOrphanedRawRecordingsSafelyMock,
  deleteStorageCleanupCandidatesSafely: deleteStorageCleanupCandidatesSafelyMock,
  updateMediaLibraryEntrySafely: updateMediaLibraryEntrySafelyMock,
}));

vi.mock(
  '../../../composition/persistence/media-library/index.library.ts',
  async (importOriginal) => ({
    ...(await importOriginal()),
    getMediaAssetBlob: getMediaAssetBlobMock,
  })
);

let anchorClickSpy = vi.fn();
let originalCreateElement: typeof document.createElement;

beforeEach(() => {
  addMediaLibraryEntryTagsSafelyMock.mockReset();
  deleteMediaLibraryAssetsBatchSafelyMock.mockReset();
  deleteOrphanedRawRecordingsSafelyMock.mockReset();
  deleteStorageCleanupCandidatesSafelyMock.mockReset();
  updateMediaLibraryEntrySafelyMock.mockReset();
  getMediaAssetBlobMock.mockReset();

  anchorClickSpy = vi.fn();
  originalCreateElement = document.createElement.bind(document);
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
    if (tagName === 'a') {
      const anchor = originalCreateElement('a');
      anchor.click = () => {
        (anchorClickSpy as () => void)();
      };
      return anchor;
    }

    return originalCreateElement(tagName);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function verifyDeleteManyFlow() {
  const items = [createMediaItem({ id: 'asset-1' }), createMediaItem({ id: 'asset-2' })];
  const previewItem = items[0];

  if (!previewItem) {
    throw new Error('Expected preview item');
  }

  const { controller, getConfirmDialog, getState } = createController({
    previewItem,
    selectedItems: items,
    selectedIds: new Set(items.map((item) => item.id)),
  });

  await createDeleteManyAction(controller)(items, runBusyAction);

  const confirmDialog = getConfirmDialog();
  expect(confirmDialog?.message).toContain('2');

  await confirmDialog?.onConfirm();

  expect(deleteMediaLibraryAssetsBatchSafelyMock).toHaveBeenCalledWith(['asset-1', 'asset-2']);
  expect(getState().selection.selectedIds.size).toBe(0);
  expect(getState().preview.session.item).toBeNull();
  expect(controller.actions.storage.refresh).toHaveBeenCalledTimes(1);
}

async function verifyStorageCleanupFlow() {
  const group = createCleanupGroup({
    id: 'orphaned-raw-recordings',
    items: [
      {
        id: 'recording-1',
        filename: 'recording.webm',
        size: 2048,
        createdAt: 1,
        kind: 'recording',
        target: 'recording',
      },
    ],
  });
  const { controller, getConfirmDialog } = createController();

  await createStorageCleanupAction(controller)(group, runBusyAction);

  const confirmDialog = getConfirmDialog();
  expect(confirmDialog?.message).toContain('Тяжёлые файлы');

  await confirmDialog?.onConfirm();

  expect(deleteStorageCleanupCandidatesSafelyMock).toHaveBeenCalledWith(group.items);
  expect(controller.actions.storage.refresh).toHaveBeenCalledTimes(1);
}

async function verifySelectionZipAndMetadataFlows() {
  const selectedItems = [
    createMediaItem({ id: 'asset-1', filename: 'first.png' }),
    createMediaItem({ id: 'asset-2', filename: 'second.png' }),
  ];
  const previewItem = createMediaItem({ id: 'asset-1', filename: 'first.png', hasThumbnail: true });
  const { controller, getState } = createController({
    selectedItems,
    previewItem,
    filenameDraft: '  renamed.png  ',
    tagDrafts: ['tag-1'],
  });

  getMediaAssetBlobMock
    .mockResolvedValueOnce(new Blob(['first'], { type: 'image/png' }))
    .mockResolvedValueOnce(new Blob(['second'], { type: 'image/png' }));

  await createSelectionZipAction(controller)(runBusyAction);
  expect(getMediaAssetBlobMock).toHaveBeenCalledWith('asset-1');
  expect(getMediaAssetBlobMock).toHaveBeenCalledWith('asset-2');
  expect(anchorClickSpy).toHaveBeenCalledTimes(1);

  await createSaveMetadataAction(controller)(runBusyAction);
  expect(updateMediaLibraryEntrySafelyMock).toHaveBeenCalledWith('asset-1', {
    filename: 'renamed.png',
    tags: ['tag-1'],
  });
  expect(getState().preview.session.item).toEqual(previewItem);
  expect(controller.actions.storage.refresh).toHaveBeenCalledTimes(1);
}

async function verifySelectionTagFlow() {
  const selectedItems = [
    createMediaItem({ id: 'asset-1', tags: [] }),
    createMediaItem({ id: 'asset-2', tags: ['new-tag'] }),
  ];
  const { controller, getState } = createController({
    selectedItems,
    selectionTagDraft: ' new-tag ',
  });

  await createApplySelectionTagAction(controller)(runBusyAction);

  expect(addMediaLibraryEntryTagsSafelyMock).toHaveBeenCalledTimes(1);
  expect(addMediaLibraryEntryTagsSafelyMock).toHaveBeenCalledWith('asset-1', ['new-tag']);
  expect(getState().selection.selectionTagDraft).toBe('');
  expect(controller.actions.storage.refresh).toHaveBeenCalledTimes(1);
}

async function verifySelectionTagBatchFlow() {
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
      createMediaItem({ id: 'asset-1', tags: [] }),
      createMediaItem({ id: 'asset-2', tags: [] }),
    ],
    selectionTagDraft: 'batch-tag',
  });

  const pending = createApplySelectionTagAction(controller)(runBusyAction);
  await Promise.resolve();

  expect(firstStarted).toBe(true);
  expect(secondStarted).toBe(true);

  resolveFirstUpdate();
  await pending;
}

describe('gallery app actions helpers', () => {
  it('requests confirmation and deletes many gallery items after confirm', verifyDeleteManyFlow);
  it('routes storage cleanup through the confirm dialog seam', verifyStorageCleanupFlow);
  it(
    'exports selected items as zip and saves preview metadata',
    verifySelectionZipAndMetadataFlows
  );
  it('applies a selection tag only to items that do not already have it', verifySelectionTagFlow);
  it('starts selection tag updates in parallel for missing-tag items', verifySelectionTagBatchFlow);
});
