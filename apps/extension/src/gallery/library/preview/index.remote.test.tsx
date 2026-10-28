// @vitest-environment jsdom
import { createRemoteRootGalleryItem } from '../items/adapters';

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createMediaItem } from '../actions/test-support/index';
import { PreviewPanel } from './index';
import type { PreviewPanelProps } from './types';

const {
  prepareReplicaMock,
  waitReplicaMock,
  cancelReplicaMock,
  loadNativeSnapshotMock,
  openNativeEditorMock,
  formatDateMock,
  translateMock,
} = vi.hoisted(() => ({
  prepareReplicaMock: vi.fn(),
  waitReplicaMock: vi.fn(),
  cancelReplicaMock: vi.fn().mockResolvedValue({ kind: 'cancelled', outcome: 'cancelled' }),
  loadNativeSnapshotMock: vi.fn(),
  openNativeEditorMock: vi.fn(),
  formatDateMock: vi.fn(() => '31 Mar 2026'),
  translateMock: vi.fn((key: string) => key),
}));

vi.mock('../../../platform/runtime-messaging/sync-product-client', () => ({
  createSyncProductClient: () => ({
    prepareReplica: prepareReplicaMock,
    waitForOperation: waitReplicaMock,
    cancel: cancelReplicaMock,
  }),
}));
vi.mock('../../state/use-gallery-library-snapshot', () => ({
  loadGalleryLibrarySnapshot: loadNativeSnapshotMock,
}));
vi.mock('../actions/preview', () => ({ openInEditor: openNativeEditorMock }));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: translateMock,
}));

vi.mock('../ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../ui')>()),
  formatDate: formatDateMock,
  MediaThumb: () => <div data-ui="remote-thumbnail" />,
}));

vi.mock('../../video-review', () => ({
  VideoReview: (props: { aggregateId: string }) => (
    <div data-ui="preview.videoReview">{props.aggregateId}</div>
  ),
}));

vi.mock('./media', () => ({
  PreviewMedia: (props: Pick<PreviewPanelProps, 'item' | 'previewUrl'>) => (
    <div data-ui="preview.media">
      {props.item.filename}:{props.previewUrl ?? 'no-preview'}
    </div>
  ),
}));

vi.mock('./sidebar-sections', () => ({
  PreviewActions: (props: Pick<PreviewPanelProps, 'trashMode' | 'onRestoreTrash'>) =>
    props.trashMode ? (
      <section data-ui="preview.actions">
        <button
          type="button"
          data-ui="gallery.preview.restore"
          onClick={() => void props.onRestoreTrash?.()}
        >
          Restore
        </button>
      </section>
    ) : (
      <div data-ui="preview.actions" />
    ),
  PreviewMetadataCards: (props: Pick<PreviewPanelProps, 'item'>) => (
    <div data-ui="preview.metadata">{props.item.mimeType}</div>
  ),
  PreviewTagEditor: (props: Pick<PreviewPanelProps, 'tagDraft'>) => (
    <div data-ui="preview.tags">{props.tagDraft}</div>
  ),
  PreviewPromotionAction: () => <div data-ui="preview.promotion" />,
  PreviewProjectUsage: () => <div data-ui="preview.project-usage" />,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createProps(overrides: Partial<PreviewPanelProps> = {}): PreviewPanelProps {
  return {
    item: {
      id: 'asset-1',
      kind: 'screenshot',
      source: { kind: 'screenshot' },
      filename: 'preview.png',
      originalFilename: 'preview.png',
      createdAt: 1,
      updatedAt: 2,
      size: 2048,
      mimeType: 'image/png',
      width: 1280,
      height: 720,
      duration: null,
      sourceUrl: null,
      sourceTitle: null,
      sourceFavicon: null,
      tags: [],
      hasThumbnail: false,
    },
    previewUrl: 'blob:preview',
    inspectorCollapsed: false,
    filenameDraft: 'preview.png',
    tagDraft: '',
    tagDrafts: [],
    onClose: vi.fn(),
    onInspectorToggle: vi.fn(),
    onFilenameChange: vi.fn(),
    onTagDraftChange: vi.fn(),
    onRemoveTag: vi.fn(),
    onAddTag: vi.fn(),
    onSave: vi.fn(async () => undefined),
    onDownload: vi.fn(async () => undefined),
    onCopy: vi.fn(async () => undefined),
    onEdit: vi.fn(),
    onDelete: vi.fn(async () => undefined),
    ...overrides,
  };
}

function render(props: PreviewPanelProps) {
  act(() => {
    root?.render(<PreviewPanel {...props} />);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

function remoteItem() {
  return createRemoteRootGalleryItem({
    source: 'remote',
    tags: [],
    label: 'Remote project',
    kind: 'image',
    mimeType: 'image/png',
    size: 100,
    createdAt: 1,
    updatedAt: 2,
    conflict: false,
    unavailable: false,
    deleted: false,
    selection: {
      rootKind: 'media',
      rootId: 'remote-root',
      operationId: 'operation-1',
      sourceDigest: 'a'.repeat(64),
    },
  });
}
function remoteButton(key: string) {
  const node = [...(container?.querySelectorAll('button') ?? [])].find(
    (button) => button.textContent === `gallery.app.${key}`
  );
  if (!node) throw new Error(`Missing remote action ${key}`);
  return node;
}
it('opens the committed native identity after selected preparation and snapshot reload', async () => {
  const item = remoteItem();
  const native = createMediaItem({
    id: item.remote.selection.rootId,
    entityId: item.remote.selection.rootId,
  });
  prepareReplicaMock.mockResolvedValueOnce({ kind: 'accepted', requestId: 'replica' });
  waitReplicaMock.mockResolvedValueOnce({
    kind: 'operation',
    job: { state: 'ready' },
    completion: { kind: 'replica', selection: item.remote.selection },
  });
  loadNativeSnapshotMock.mockResolvedValueOnce({ nextItems: [item, native] });
  render(createProps({ item }));
  expect(container?.querySelector('input')).toBeNull();
  expect(container?.querySelector('[data-ui="preview.actions"]')).toBeNull();
  await act(async () => remoteButton('remoteDownloadOpen').click());
  expect(prepareReplicaMock).toHaveBeenCalledWith(item.remote.selection);
  expect(loadNativeSnapshotMock).toHaveBeenCalledWith({ includeRemote: false });
  expect(openNativeEditorMock).toHaveBeenCalledWith(native);
  expect(openNativeEditorMock).not.toHaveBeenCalledWith(item);
});

it('keeps a failed remote preparation in the preview without opening an older local project', async () => {
  const item = remoteItem();
  prepareReplicaMock.mockResolvedValueOnce({ kind: 'accepted', requestId: 'replica-failed' });
  waitReplicaMock.mockResolvedValueOnce({
    kind: 'operation',
    job: { state: 'failed', failureCode: 'invalid-data' },
    completion: null,
  });
  render(createProps({ item }));
  await act(async () => remoteButton('remoteDownloadOpen').click());
  expect(container?.querySelector('[role="alert"]')?.textContent).toBe('gallery.app.remoteFailed');
  expect(loadNativeSnapshotMock).not.toHaveBeenCalled();
  expect(openNativeEditorMock).not.toHaveBeenCalled();
});

it('confirms cancellation without native navigation and retains remote metadata', async () => {
  prepareReplicaMock.mockResolvedValueOnce({ kind: 'accepted', requestId: 'replica-cancel' });
  const item = remoteItem();
  let finishWait:
    | ((result: {
        kind: 'operation';
        job: { state: 'ready' };
        completion: { kind: 'replica'; selection: typeof item.remote.selection };
      }) => void)
    | undefined;
  waitReplicaMock.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishWait = resolve;
      })
  );
  render(createProps({ item }));
  await act(async () => remoteButton('remoteDownloadOpen').click());
  await act(async () => remoteButton('remoteCancel').click());
  expect(cancelReplicaMock).toHaveBeenCalledWith('replica-cancel');
  expect(waitReplicaMock.mock.calls.at(-1)?.[1]?.aborted).toBe(true);
  await act(async () =>
    finishWait?.({
      kind: 'operation',
      job: { state: 'ready' },
      completion: { kind: 'replica', selection: item.remote.selection },
    })
  );
  expect(container?.querySelector('[role="status"]')?.textContent).toBe(
    'gallery.app.remoteCancelled'
  );
  expect(openNativeEditorMock).not.toHaveBeenCalled();
  expect(container?.textContent).toContain('Remote project');
});

it('observes completion when cancellation rejects after delayed preparation admission', async () => {
  const item = remoteItem();
  const native = createMediaItem({
    id: item.remote.selection.rootId,
    entityId: item.remote.selection.rootId,
  });
  let accept: ((value: { kind: 'accepted'; requestId: string }) => void) | undefined;
  let finishWait: ((value: unknown) => void) | undefined;
  prepareReplicaMock.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        accept = resolve;
      })
  );
  cancelReplicaMock.mockRejectedValueOnce(new Error('Cancellation response unavailable'));
  waitReplicaMock.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishWait = resolve;
      })
  );
  loadNativeSnapshotMock.mockResolvedValueOnce({ nextItems: [native] });
  render(createProps({ item }));
  await act(async () => remoteButton('remoteDownloadOpen').click());
  await act(async () => remoteButton('remoteCancel').click());
  expect(cancelReplicaMock).not.toHaveBeenCalled();
  await act(async () => accept?.({ kind: 'accepted', requestId: 'late-cancel-rejected' }));
  expect(cancelReplicaMock).toHaveBeenCalledWith('late-cancel-rejected');
  expect(waitReplicaMock).toHaveBeenCalledWith('late-cancel-rejected', expect.any(AbortSignal));
  expect(container?.querySelector('[role="alert"]')?.textContent).toBe(
    'gallery.app.remoteCancelRefused'
  );
  expect(remoteButton('remoteCancel').disabled).toBe(false);
  expect(openNativeEditorMock).not.toHaveBeenCalled();
  await act(async () =>
    finishWait?.({
      kind: 'operation',
      job: { state: 'ready' },
      completion: { kind: 'replica', selection: item.remote.selection },
    })
  );
  expect(loadNativeSnapshotMock).toHaveBeenCalledWith({ includeRemote: false });
  expect(openNativeEditorMock).toHaveBeenCalledWith(native);
});

it('cancels a late accepted request after preview closes without opening an editor', async () => {
  let accept: ((value: { kind: 'accepted'; requestId: string }) => void) | undefined;
  prepareReplicaMock.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        accept = resolve;
      })
  );
  render(createProps({ item: remoteItem() }));
  await act(async () => remoteButton('remoteDownloadOpen').click());
  render(createProps({ item: createMediaItem() }));
  await act(async () => accept?.({ kind: 'accepted', requestId: 'late-accepted' }));
  expect(cancelReplicaMock).toHaveBeenCalledWith('late-accepted');
  expect(openNativeEditorMock).not.toHaveBeenCalled();
  expect(loadNativeSnapshotMock).not.toHaveBeenCalled();
});

it('aborts a terminal wait when the remote preview unmounts and ignores its late committed result', async () => {
  const item = remoteItem();
  let finishWait:
    | ((result: {
        kind: 'operation';
        job: { state: 'ready' };
        completion: { kind: 'replica'; selection: typeof item.remote.selection };
      }) => void)
    | undefined;
  prepareReplicaMock.mockResolvedValueOnce({ kind: 'accepted', requestId: 'unmounted-wait' });
  waitReplicaMock.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishWait = resolve;
      })
  );
  render(createProps({ item }));
  await act(async () => remoteButton('remoteDownloadOpen').click());
  const signal = waitReplicaMock.mock.calls.at(-1)?.[1];
  render(createProps({ item: createMediaItem() }));
  expect(signal?.aborted).toBe(true);
  expect(cancelReplicaMock).toHaveBeenCalledWith('unmounted-wait');
  await act(async () =>
    finishWait?.({
      kind: 'operation',
      job: { state: 'ready' },
      completion: { kind: 'replica', selection: item.remote.selection },
    })
  );
  expect(loadNativeSnapshotMock).not.toHaveBeenCalled();
  expect(openNativeEditorMock).not.toHaveBeenCalled();
});

it('refuses a terminal replica completion for a different selected version', async () => {
  const item = remoteItem();
  prepareReplicaMock.mockResolvedValueOnce({ kind: 'accepted', requestId: 'different-version' });
  waitReplicaMock.mockResolvedValueOnce({
    kind: 'operation',
    job: { state: 'ready' },
    completion: {
      kind: 'replica',
      selection: { ...item.remote.selection, operationId: 'another-operation' },
    },
  });
  render(createProps({ item }));
  await act(async () => remoteButton('remoteDownloadOpen').click());
  expect(loadNativeSnapshotMock).not.toHaveBeenCalled();
  expect(openNativeEditorMock).not.toHaveBeenCalled();
  expect(container?.querySelector('[role="alert"]')?.textContent).toBe('gallery.app.remoteFailed');
});

it.each(['refused', 'already-completed', 'rejected'] as const)(
  'resumes terminal observation after admitted cancellation is %s',
  async (outcome) => {
    const item = remoteItem();
    const native = createMediaItem({
      id: item.remote.selection.rootId,
      entityId: item.remote.selection.rootId,
    });
    let finishWait: ((value: unknown) => void) | undefined;
    prepareReplicaMock.mockResolvedValueOnce({ kind: 'accepted', requestId: 'cancel-recovery' });
    waitReplicaMock.mockImplementationOnce(
      (_id: string, signal: AbortSignal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true }
          );
        })
    );
    waitReplicaMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishWait = resolve;
        })
    );
    if (outcome === 'rejected')
      cancelReplicaMock.mockRejectedValueOnce(new Error('Lost cancel response'));
    else cancelReplicaMock.mockResolvedValueOnce({ kind: 'cancelled', outcome });
    loadNativeSnapshotMock.mockResolvedValueOnce({ nextItems: [native] });
    render(createProps({ item }));
    await act(async () => remoteButton('remoteDownloadOpen').click());
    const initialSignal = waitReplicaMock.mock.calls.at(-1)?.[1];
    await act(async () => remoteButton('remoteCancel').click());
    expect(initialSignal?.aborted).toBe(true);
    expect(waitReplicaMock).toHaveBeenCalledTimes(2);
    expect(waitReplicaMock).toHaveBeenLastCalledWith('cancel-recovery', expect.any(AbortSignal));
    const feedback = outcome === 'already-completed' ? 'remotePreparing' : 'remoteCancelRefused';
    expect(container?.textContent).toContain(`gallery.app.${feedback}`);
    expect(remoteButton('remoteCancel').disabled).toBe(false);
    expect(remoteButton('remoteDownloadOpen').disabled).toBe(true);
    expect(openNativeEditorMock).not.toHaveBeenCalled();
    await act(async () =>
      finishWait?.({
        kind: 'operation',
        job: { state: 'ready' },
        completion: { kind: 'replica', selection: item.remote.selection },
      })
    );
    expect(openNativeEditorMock).toHaveBeenCalledExactlyOnceWith(native);
  }
);
