// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createClosePreviewAction, createSaveMetadataAction, resetPreviewChanges } from './preview';
import { createNavigatePreviewAction } from './preview-navigation';
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
    project: { createdAt: 1, id: 'project-1', name: 'Scenario', tags: ['flow'], updatedAt: 2 },
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
    project: { createdAt: 1, id: 'project-1', name: 'Scenario', tags: ['flow'], updatedAt: 2 },
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

async function verifyMissingPreviewMetadataNoop() {
  const { controller } = createController();

  await createSaveMetadataAction(controller)(runBusyAction);

  expect(updateMediaLibraryEntrySafelyMock).not.toHaveBeenCalled();
  expect(updateScenarioProjectRecordMetadataMock).not.toHaveBeenCalled();
}

describe('gallery app preview and shared actions', () => {
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
