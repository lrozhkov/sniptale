// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createClosePreviewAction, createSaveMetadataAction, resetPreviewChanges } from './preview';
import {
  createNavigatePreviewAction,
  createPreviewNavigationCoordinator,
} from './preview-navigation';
import {
  createController,
  createMediaItem,
  createScenarioItem,
  runBusyAction,
} from './test-support/index';

const { updateMediaLibraryEntrySafelyMock, updateScenarioProjectRecordMetadataMock } = vi.hoisted(
  () => ({
    updateMediaLibraryEntrySafelyMock: vi.fn(),
    updateScenarioProjectRecordMetadataMock: vi.fn(),
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
  updateScenarioProjectRecordMetadata: updateScenarioProjectRecordMetadataMock,
}));

beforeEach(() => {
  vi.clearAllMocks();
  updateMediaLibraryEntrySafelyMock.mockReset();
  updateScenarioProjectRecordMetadataMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function verifyPreviewMetadataCloseFlow() {
  const previewItem = createMediaItem({
    filename: 'capture.png',
    id: 'asset-1',
    tags: ['alpha'],
  });
  const { controller, getState } = createController({
    filenameDraft: ' renamed.png ',
    previewItem,
    previewInspectorCollapsed: true,
    tagDrafts: ['alpha', 'beta'],
  });

  await createClosePreviewAction(controller)(runBusyAction);

  expect(updateMediaLibraryEntrySafelyMock).toHaveBeenCalledWith('asset-1', {
    filename: 'renamed.png',
    tags: ['alpha', 'beta'],
  });
  expect(getState().preview.session.item).toBeNull();
  expect(controller.actions.storage.refresh).toHaveBeenCalledTimes(1);
}

async function verifyScenarioPreviewMetadataCloseFlow() {
  const previewItem = createScenarioItem({
    filename: 'Scenario',
    id: 'scenario:project-1',
    project: {
      availability: 'available' as const,
      createdAt: 1,
      id: 'project-1',
      name: 'Scenario',
      tags: ['flow'],
      updatedAt: 2,
    },
    tags: ['flow'],
  });
  const { controller, getState } = createController({
    filenameDraft: ' Scenario updated ',
    previewItem,
    tagDrafts: ['flow', 'demo'],
  });

  await createClosePreviewAction(controller)(runBusyAction);

  expect(updateScenarioProjectRecordMetadataMock).toHaveBeenCalledWith('project-1', {
    name: 'Scenario updated',
    tags: ['flow', 'demo'],
  });
  expect(getState().preview.session.item).toBeNull();
}

function verifyPreviewDraftResetFlow() {
  const previewItem = createScenarioItem({
    filename: 'Scenario',
    id: 'scenario:project-1',
    project: {
      availability: 'available' as const,
      createdAt: 1,
      id: 'project-1',
      name: 'Scenario',
      tags: ['flow'],
      updatedAt: 2,
    },
    tags: ['flow'],
  });
  const { controller, getState } = createController({
    filenameDraft: 'Changed',
    previewItem,
    tagDraft: 'draft',
    tagDrafts: ['demo'],
  });

  resetPreviewChanges(controller);

  expect(getState().preview.draft.filename).toBe('Scenario');
  expect(getState().preview.draft.tagInput).toBe('');
  expect(getState().preview.draft.tags).toEqual(['flow']);
}

async function verifyPreviewMetadataSaveFlow() {
  const previewItem = createMediaItem({
    filename: 'first.png',
    id: 'asset-1',
  });
  const { controller, getState } = createController({
    filenameDraft: '  renamed.png  ',
    previewItem,
    tagDrafts: ['tag-1'],
  });

  await createSaveMetadataAction(controller)(runBusyAction);

  expect(updateMediaLibraryEntrySafelyMock).toHaveBeenCalledWith('asset-1', {
    filename: 'renamed.png',
    tags: ['tag-1'],
  });
  expect(getState().preview.session.item).toEqual(previewItem);
  expect(controller.actions.storage.refresh).toHaveBeenCalledTimes(1);
}

async function verifyPreviewNavigationFlow() {
  const currentItem = createMediaItem({ filename: 'first.png', id: 'asset-1' });
  const nextItem = createMediaItem({ filename: 'next.png', id: 'asset-2' });
  const { controller, getState } = createController({
    filenameDraft: 'renamed.png',
    previewInspectorCollapsed: true,
    previewItem: currentItem,
  });

  await createNavigatePreviewAction(controller)(nextItem, runBusyAction);

  expect(updateMediaLibraryEntrySafelyMock).toHaveBeenCalledWith('asset-1', {
    filename: 'renamed.png',
  });
  expect(getState().preview.session).toMatchObject({
    inspectorCollapsed: true,
    item: nextItem,
    url: null,
  });
}

async function verifyFailedPreviewNavigationKeepsCurrentItem() {
  const currentItem = createMediaItem({ filename: 'first.png', id: 'asset-1' });
  const nextItem = createMediaItem({ filename: 'next.png', id: 'asset-2' });
  const { controller, getState } = createController({
    filenameDraft: 'renamed.png',
    previewItem: currentItem,
  });
  updateMediaLibraryEntrySafelyMock.mockRejectedValueOnce(new Error('write failed'));

  await expect(createNavigatePreviewAction(controller)(nextItem, runBusyAction)).rejects.toThrow(
    'write failed'
  );

  expect(getState().preview.session.item).toEqual(currentItem);
}

async function verifyCleanPreviewNavigationAvoidsLibraryRefresh() {
  const currentItem = createMediaItem({ filename: 'first.png', id: 'asset-1' });
  const nextItem = createMediaItem({ filename: 'next.png', id: 'asset-2' });
  const { controller, getState } = createController({ previewItem: currentItem });

  await createNavigatePreviewAction(controller)(nextItem, runBusyAction);

  expect(getState().preview.session.item).toEqual(nextItem);
  expect(controller.actions.storage.refresh).not.toHaveBeenCalled();
}

async function verifyNewestDirtyNavigationWins() {
  const first = createMediaItem({ filename: 'first.png', id: 'asset-1' });
  const second = createMediaItem({ filename: 'second.png', id: 'asset-2' });
  const third = createMediaItem({ filename: 'third.png', id: 'asset-3' });
  const { controller, getState } = createController({
    filenameDraft: 'renamed.png',
    previewItem: first,
  });
  let resolveSave!: () => void;
  updateMediaLibraryEntrySafelyMock.mockImplementationOnce(
    () => new Promise<void>((resolve) => (resolveSave = resolve))
  );
  const coordinator = createPreviewNavigationCoordinator();
  const navigate = createNavigatePreviewAction(controller, coordinator, () => controller.state);

  const toSecond = navigate(second, runBusyAction);
  const toThird = navigate(third, runBusyAction);
  expect(getState().preview.session.item).toEqual(first);
  expect(updateMediaLibraryEntrySafelyMock).toHaveBeenCalledTimes(1);
  resolveSave();
  await Promise.all([toSecond, toThird]);

  expect(getState().preview.session.item).toEqual(third);
  expect(controller.actions.storage.refresh).toHaveBeenCalledTimes(1);
}

async function verifyEditedDraftStopsPendingNavigation() {
  const first = createMediaItem({ filename: 'first.png', id: 'asset-1' });
  const second = createMediaItem({ filename: 'second.png', id: 'asset-2' });
  const { controller, getState } = createController({
    filenameDraft: 'renamed.png',
    previewItem: first,
  });
  let resolveSave!: () => void;
  updateMediaLibraryEntrySafelyMock.mockImplementationOnce(
    () => new Promise<void>((resolve) => (resolveSave = resolve))
  );
  const navigate = createNavigatePreviewAction(
    controller,
    createPreviewNavigationCoordinator(),
    () => controller.state
  );

  const pending = navigate(second, runBusyAction);
  controller.actions.preview.setFilenameDraft('newer.png');
  resolveSave();
  await pending;

  expect(getState().preview.session.item).toEqual(first);
  expect(getState().preview.draft.filename).toBe('newer.png');
  expect(controller.actions.storage.refresh).not.toHaveBeenCalled();
}

async function verifySettledSaveIsNotReusedForLaterEdit() {
  const first = createMediaItem({ filename: 'first.png', id: 'asset-1' });
  const second = createMediaItem({ filename: 'second.png', id: 'asset-2' });
  const { controller, getState } = createController({
    filenameDraft: 'renamed.png',
    previewItem: first,
  });
  let resolveSave!: () => void;
  updateMediaLibraryEntrySafelyMock.mockImplementationOnce(
    () => new Promise<void>((resolve) => (resolveSave = resolve))
  );
  const coordinator = createPreviewNavigationCoordinator();
  const navigate = createNavigatePreviewAction(controller, coordinator, () => controller.state);

  const firstAttempt = navigate(second, runBusyAction);
  controller.actions.preview.setFilenameDraft('newer.png');
  resolveSave();
  await firstAttempt;
  expect(getState().preview.session.item).toEqual(first);

  controller.actions.preview.setPreview({
    inspectorCollapsed: false,
    item: { ...first, filename: 'external.png', updatedAt: first.updatedAt + 1 },
    url: null,
  });
  controller.actions.preview.setFilenameDraft('renamed.png');
  await navigate(second, runBusyAction);

  expect(updateMediaLibraryEntrySafelyMock).toHaveBeenCalledTimes(2);
  expect(getState().preview.session.item).toEqual(second);
}

async function verifyRevertedDraftIsSavedAfterPendingNavigation() {
  const first = createMediaItem({ filename: 'first.png', id: 'asset-1' });
  const second = createMediaItem({ filename: 'second.png', id: 'asset-2' });
  const { controller, getState } = createController({
    filenameDraft: 'temporary.png',
    previewItem: first,
  });
  let resolveSave!: () => void;
  updateMediaLibraryEntrySafelyMock.mockImplementationOnce(
    () => new Promise<void>((resolve) => (resolveSave = resolve))
  );
  const coordinator = createPreviewNavigationCoordinator();
  const navigate = createNavigatePreviewAction(controller, coordinator, () => controller.state);

  const firstAttempt = navigate(second, runBusyAction);
  controller.actions.preview.setFilenameDraft('first.png');
  resolveSave();
  await firstAttempt;
  expect(getState().preview.session.item).toEqual(first);

  await navigate(second, runBusyAction);
  expect(updateMediaLibraryEntrySafelyMock).toHaveBeenNthCalledWith(2, 'asset-1', {
    filename: 'first.png',
  });
  expect(getState().preview.session.item).toEqual(second);
}

async function verifyNavigationWritesAreOrdered() {
  const first = createMediaItem({ filename: 'first.png', id: 'asset-1' });
  const second = createMediaItem({ filename: 'second.png', id: 'asset-2' });
  const { controller, getState } = createController({
    filenameDraft: 'temporary.png',
    previewItem: first,
  });
  let resolveFirst!: () => void;
  updateMediaLibraryEntrySafelyMock.mockImplementationOnce(
    () => new Promise<void>((resolve) => (resolveFirst = resolve))
  );
  const coordinator = createPreviewNavigationCoordinator();
  const navigate = createNavigatePreviewAction(controller, coordinator, () => controller.state);
  const firstAttempt = navigate(second, runBusyAction);
  controller.actions.preview.setFilenameDraft('latest.png');
  const latestAttempt = navigate(second, runBusyAction);
  expect(updateMediaLibraryEntrySafelyMock).toHaveBeenCalledTimes(1);
  resolveFirst();
  await Promise.all([firstAttempt, latestAttempt]);
  expect(updateMediaLibraryEntrySafelyMock).toHaveBeenNthCalledWith(2, 'asset-1', {
    filename: 'latest.png',
  });
  expect(getState().preview.session.item).toEqual(second);
}

async function verifyClosedPreviewRejectsPendingNavigation() {
  const first = createMediaItem({ filename: 'first.png', id: 'asset-1' });
  const second = createMediaItem({ filename: 'second.png', id: 'asset-2' });
  const { controller, getState } = createController({
    filenameDraft: 'renamed.png',
    previewItem: first,
  });
  let resolveSave!: () => void;
  updateMediaLibraryEntrySafelyMock.mockImplementationOnce(
    () => new Promise<void>((resolve) => (resolveSave = resolve))
  );
  const coordinator = createPreviewNavigationCoordinator();
  const navigate = createNavigatePreviewAction(controller, coordinator, () => controller.state);

  const pending = navigate(second, runBusyAction);
  coordinator.revision += 1;
  controller.actions.preview.setPreview({ inspectorCollapsed: false, item: null, url: null });
  resolveSave();
  await pending;

  expect(getState().preview.session.item).toBeNull();
}

async function verifyMissingPreviewMetadataNoop() {
  const { controller } = createController();

  await createSaveMetadataAction(controller)(runBusyAction);

  expect(updateMediaLibraryEntrySafelyMock).not.toHaveBeenCalled();
  expect(updateScenarioProjectRecordMetadataMock).not.toHaveBeenCalled();
}

describe('gallery app preview and shared actions', () => {
  it(
    'switches a clean preview without rescanning the library',
    verifyCleanPreviewNavigationAvoidsLibraryRefresh
  );
  it('commits only the newest overlapping dirty navigation', verifyNewestDirtyNavigationWins);
  it(
    'keeps a newer metadata draft during a pending navigation save',
    verifyEditedDraftStopsPendingNavigation
  );
  it('does not reuse a settled save for a later edit', verifySettledSaveIsNotReusedForLaterEdit);
  it(
    'saves a draft restored to its old baseline after a pending write',
    verifyRevertedDraftIsSavedAfterPendingNavigation
  );
  it('orders different drafts before committing navigation', verifyNavigationWritesAreOrdered);
  it(
    'does not reopen a closed preview after a pending save',
    verifyClosedPreviewRejectsPendingNavigation
  );
  it('persists media draft metadata when closing the preview', verifyPreviewMetadataCloseFlow);
  it(
    'persists scenario draft metadata only on preview close',
    verifyScenarioPreviewMetadataCloseFlow
  );
  it('resets preview draft edits back to the item snapshot', verifyPreviewDraftResetFlow);
  it(
    'saves normalized preview metadata through the media-library owner',
    verifyPreviewMetadataSaveFlow
  );
  it(
    'persists metadata before navigating and preserves inspector state',
    verifyPreviewNavigationFlow
  );
  it(
    'keeps the current preview when navigation persistence fails',
    verifyFailedPreviewNavigationKeepsCurrentItem
  );
  it('skips metadata persistence without a preview item', verifyMissingPreviewMetadataNoop);
});
