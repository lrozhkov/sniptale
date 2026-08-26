// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  copyPreviewItem,
  createRestoreOriginalAction,
  createSaveImageCopyAction,
  downloadOriginalPreviewItem,
  downloadPreviewItem,
  openInEditor,
} from './preview';
import { createBusyActionRunner } from './shared';
import {
  createController,
  createMediaItem,
  createScenarioItem,
  createVideoProjectItem,
} from './test-support/index';

const {
  getMediaAssetBlobMock,
  getAggregatePreviewBlobMock,
  copyImageAggregateMock,
  restoreImageAggregateOriginalMock,
  browserTabsCreateMock,
  writeBrowserClipboardItemsMock,
  buildEditorUrlMock,
  openScenarioEditorPageMock,
  openVideoEditorPageMock,
} = vi.hoisted(() => ({
  getMediaAssetBlobMock: vi.fn(),
  getAggregatePreviewBlobMock: vi.fn(),
  copyImageAggregateMock: vi.fn(),
  restoreImageAggregateOriginalMock: vi.fn(),
  browserTabsCreateMock: vi.fn(),
  writeBrowserClipboardItemsMock: vi.fn(),
  buildEditorUrlMock: vi.fn((options: { assetId?: string | null; sessionId?: string | null }) => {
    const params = new URLSearchParams();
    if (options.assetId) {
      params.set('assetId', options.assetId);
    }
    if (options.sessionId) {
      params.set('session', options.sessionId);
    }
    return `chrome-extension://test/apps/extension/src/editor/index.html?${params.toString()}`;
  }),
  openScenarioEditorPageMock: vi.fn(),
  openVideoEditorPageMock: vi.fn(),
}));

vi.mock(
  '../../../composition/persistence/media-library/index.library.ts',
  async (importOriginal) => ({
    ...(await importOriginal()),
    getMediaAssetBlob: getMediaAssetBlobMock,
  })
);

vi.mock('../../../composition/persistence/aggregate-presentations', () => ({
  getAggregatePreviewBlob: getAggregatePreviewBlobMock,
}));

vi.mock('../../../composition/persistence/image-aggregates', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/image-aggregates')>()),
  copyImageAggregate: copyImageAggregateMock,
  restoreImageAggregateOriginal: restoreImageAggregateOriginalMock,
}));

vi.mock('@sniptale/platform/browser/tabs', () => ({
  browserTabs: { create: browserTabsCreateMock },
}));

vi.mock('@sniptale/platform/browser/clipboard', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/clipboard')>()),
  writeBrowserClipboardItems: writeBrowserClipboardItemsMock,
}));

vi.mock('@sniptale/platform/security/secure-random-id', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/security/secure-random-id')>()),
  createSecureRandomUuid: () => 'session-1',
}));

vi.mock('../../../platform/navigation/extension-pages/editor', () => ({
  buildEditorUrl: buildEditorUrlMock,
}));

vi.mock('../../../platform/navigation/extension-pages/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/navigation/extension-pages/index')>()),
  openScenarioEditorPage: openScenarioEditorPageMock,
  openVideoEditorPage: openVideoEditorPageMock,
  openWebSnapshotViewerPage: vi.fn(),
}));

let anchorClickSpy = vi.fn();
let originalCreateElement: typeof document.createElement;

beforeEach(() => {
  vi.clearAllMocks();
  anchorClickSpy = vi.fn();
  originalCreateElement = document.createElement.bind(document);
  vi.stubGlobal(
    'ClipboardItem',
    class MockClipboardItem {
      constructor(public readonly data: Record<string, Blob>) {}
    }
  );
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
    if (tagName !== 'a') {
      return originalCreateElement(tagName);
    }
    const anchor = originalCreateElement('a');
    anchor.click = () => {
      (anchorClickSpy as () => void)();
    };
    return anchor;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

function createRunBusy(setBanner = vi.fn(), setIsBusy = vi.fn()) {
  return createBusyActionRunner({
    actions: {
      surface: {
        setBanner,
        setConfirmDialog: vi.fn(),
        setIsBusy,
        setPendingExport: vi.fn(),
      },
    },
  });
}

async function verifyPreviewDownloadAndCopyFlows() {
  const { controller } = createController({
    previewItem: createMediaItem({ id: 'asset-1', filename: 'preview.png' }),
  });
  const setIsBusy = vi.fn();
  const runBusy = createRunBusy(vi.fn(), setIsBusy);
  getAggregatePreviewBlobMock.mockResolvedValue(new Blob(['preview'], { type: 'image/png' }));

  await downloadPreviewItem(controller, runBusy);
  await flushMicrotasks();
  await copyPreviewItem(controller, runBusy);
  await flushMicrotasks();

  expect(anchorClickSpy).toHaveBeenCalledTimes(1);
  expect(writeBrowserClipboardItemsMock).toHaveBeenCalledTimes(1);
  expect(setIsBusy).toHaveBeenNthCalledWith(1, true);
  expect(setIsBusy).toHaveBeenLastCalledWith(false);
}

async function verifyPreviewErrorBannerFlow() {
  const { controller } = createController({
    previewItem: createMediaItem({ id: 'asset-2', filename: 'broken.png' }),
  });
  const setBanner = vi.fn();
  getAggregatePreviewBlobMock
    .mockResolvedValueOnce(null)
    .mockRejectedValueOnce(new Error('copy failed'));

  await downloadPreviewItem(controller, createRunBusy(setBanner));
  await flushMicrotasks();
  await copyPreviewItem(controller, createRunBusy(setBanner));
  await flushMicrotasks();

  expect(setBanner).toHaveBeenNthCalledWith(1, expect.stringContaining('broken.png'));
  expect(setBanner).toHaveBeenNthCalledWith(2, 'copy failed');
}

async function verifyOriginalAndCopyActions() {
  const { controller, getState } = createController({
    previewItem: createMediaItem({
      id: 'image-1',
      filename: 'edited.png',
      imageContentState: 'edited',
      originalFilename: 'original.png',
      workspaceRevision: 4,
    }),
  });
  const runBusy = createRunBusy();
  getMediaAssetBlobMock.mockResolvedValue(new Blob(['original'], { type: 'image/png' }));
  restoreImageAggregateOriginalMock.mockResolvedValue({ revision: 5, updatedAt: 10 });
  copyImageAggregateMock.mockResolvedValue('session-1');

  await downloadOriginalPreviewItem(controller, runBusy);
  createRestoreOriginalAction(controller, runBusy)();
  await getState().storage.confirmDialog?.onConfirm();
  await createSaveImageCopyAction(controller, runBusy)();

  expect(anchorClickSpy).toHaveBeenCalledTimes(1);
  expect(restoreImageAggregateOriginalMock).toHaveBeenCalledWith('image-1', 4);
  expect(copyImageAggregateMock).toHaveBeenCalledWith({
    aggregateId: 'image-1',
    expectedWorkspaceRevision: 5,
    targetAggregateId: 'session-1',
  });
  expect(getState().preview.session.item).toEqual(
    expect.objectContaining({
      imageContentState: 'original',
      presentationRevision: 5,
      workspaceRevision: 5,
    })
  );
}

async function verifyOriginalActionsIgnorePristineImages() {
  const { controller, getState } = createController({
    previewItem: createMediaItem({ imageContentState: 'original', workspaceRevision: 0 }),
  });

  await downloadOriginalPreviewItem(controller, createRunBusy());
  createRestoreOriginalAction(controller, createRunBusy())();

  expect(getMediaAssetBlobMock).not.toHaveBeenCalled();
  expect(getState().storage.confirmDialog).toBeNull();
  expect(restoreImageAggregateOriginalMock).not.toHaveBeenCalled();
}

function verifyOpenInEditorFlow() {
  openInEditor(createMediaItem({ id: 'asset-1', kind: 'image' }));
  openInEditor(createMediaItem({ id: 'asset-2', kind: 'recording' }));
  openInEditor(
    createMediaItem({
      id: 'asset-grouped',
      kind: 'recording',
      recordingGroupView: {
        groupId: 'capture-1',
        memberCount: 2,
        order: 0,
        projectId: 'group-project-1',
        role: 'display',
        sourceLabel: null,
      },
    })
  );
  openInEditor(createScenarioItem({ entityId: 'project-1', id: 'scenario:project-1' }));
  openInEditor(createVideoProjectItem({ entityId: 'video-project-1' }));
  openInEditor(
    createVideoProjectItem({ entityId: 'invalid-project', unavailableReason: 'invalid' })
  );

  expect(browserTabsCreateMock).toHaveBeenCalledTimes(1);
  expect(browserTabsCreateMock).toHaveBeenCalledWith(
    expect.objectContaining({ url: expect.stringContaining('assetId=asset-1') })
  );
  expect(openScenarioEditorPageMock).toHaveBeenCalledWith('project-1');
  expect(openVideoEditorPageMock).toHaveBeenCalledWith('video-project-1', null);
  expect(openVideoEditorPageMock).toHaveBeenCalledWith('group-project-1', null);
  expect(openVideoEditorPageMock).not.toHaveBeenCalledWith('invalid-project', null);
}

async function verifyBusyActionRunnerFlow() {
  const setBanner = vi.fn();
  const setIsBusy = vi.fn();

  await createRunBusy(
    setBanner,
    setIsBusy
  )(async () => {
    throw new Error('boom');
  });

  expect(setIsBusy).toHaveBeenNthCalledWith(1, true);
  expect(setBanner).toHaveBeenCalledWith('boom');
  expect(setIsBusy).toHaveBeenLastCalledWith(false);
}

describe('gallery preview shared actions', () => {
  it(
    'downloads and copies the preview asset through shared seams',
    verifyPreviewDownloadAndCopyFlows
  );
  it(
    'surfaces preview download and copy failures through the banner owner seam',
    verifyPreviewErrorBannerFlow
  );
  it('opens only image assets in the editor flow', verifyOpenInEditorFlow);
  it(
    'downloads the immutable original, restores it in place, and saves copies with a new id',
    verifyOriginalAndCopyActions
  );
  it(
    'ignores original-only actions while the current image is pristine',
    verifyOriginalActionsIgnorePristineImages
  );
  it(
    'surfaces busy-action failures without leaving the busy flag enabled',
    verifyBusyActionRunnerFlow
  );
});
