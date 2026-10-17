// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import type { RecoveryRecording } from '../../workflows/video/recording-recovery';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  recover: vi.fn(),
  download: vi.fn(),
  remove: vi.fn(),
  launch: vi.fn(),
}));
vi.mock('../../workflows/video/recording-recovery', () => ({
  listRecoverableRecordings: mocks.list,
  recoverRecording: mocks.recover,
  prepareOriginalRecordingDownload: mocks.download,
  deleteRecoveryRecording: mocks.remove,
}));
vi.mock('../shared/download', () => ({ downloadGalleryBlob: mocks.launch }));
vi.mock('@sniptale/ui/product-feedback/confirm-dialog', () => ({
  ProductConfirmDialog: (props: {
    isOpen: boolean;
    message: React.ReactNode;
    confirmDisabled: boolean;
    onConfirm(): void;
    onCancel(): void;
  }) =>
    props.isOpen ? (
      <div role="dialog">
        {props.message}
        <button data-confirm disabled={props.confirmDisabled} onClick={props.onConfirm}>
          confirm
        </button>
        <button data-cancel onClick={props.onCancel}>
          cancel
        </button>
      </div>
    ) : null,
}));
import { GalleryRecordingRecovery } from './index';
import { translate } from '../../platform/i18n';

const entry: RecoveryRecording = {
  id: 'source',
  recoveryId: 'restored',
  incarnation: 'one',
  epoch: 'epoch',
  filename: 'recording.webm',
  mimeType: 'video/webm',
  createdAt: 1,
  size: 100,
  blockCount: 1,
  complete: false,
  published: false,
};
let root: Root;
let container: HTMLDivElement;
async function mount(disabled = false) {
  await act(async () => root.render(<GalleryRecordingRecovery disabled={disabled} />));
}
function button(label: string) {
  const found = Array.from(container.querySelectorAll('button')).find(
    (node) => node.textContent === label
  );
  if (!found) throw new Error(`Missing button ${label}`);
  return found;
}
async function click(label: string) {
  await act(async () => button(label).click());
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.list.mockResolvedValue([entry]);
  mocks.recover.mockResolvedValue('restored');
  mocks.remove.mockResolvedValue(undefined);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

it('shows an empty result without a false recovery warning', async () => {
  mocks.list.mockResolvedValue([]);
  await mount();
  expect(container.textContent).toBe('');
});
it('shows failed discovery and retries without reporting empty success', async () => {
  mocks.list.mockRejectedValueOnce(new Error('unavailable'));
  await mount();
  expect(container.textContent).toContain(translate('gallery.recordingRecovery.loadFailed'));
  await click(translate('gallery.recordingRecovery.retry'));
  expect(container.textContent).toContain(entry.filename);
  expect(container.querySelector('[role=alert]')).toBeNull();
});
it('keeps newer discovery when an earlier request finishes late', async () => {
  let complete: ((value: RecoveryRecording[]) => void) | undefined;
  mocks.list.mockImplementationOnce(
    () =>
      new Promise<RecoveryRecording[]>((resolve) => {
        complete = resolve;
      })
  );
  await mount();
  await act(async () => window.dispatchEvent(new Event('focus')));
  expect(container.textContent).toContain(entry.filename);
  await act(async () => complete?.([]));
  expect(container.textContent).toContain(entry.filename);
});
it('refuses actions during an existing library operation', async () => {
  await mount(true);
  await click(translate('gallery.recordingRecovery.recover'));
  await click(translate('gallery.recordingRecovery.download'));
  expect(mocks.recover).not.toHaveBeenCalled();
  expect(mocks.download).not.toHaveBeenCalled();
});
it('retains originals and retry after failed recovery or download', async () => {
  mocks.recover.mockRejectedValue(new Error('decode failed'));
  mocks.download.mockRejectedValue(new Error('read failed'));
  await mount();
  await click(translate('gallery.recordingRecovery.recover'));
  expect(container.textContent).toContain(entry.filename);
  expect(container.textContent).toContain(translate('gallery.recordingRecovery.actionFailed'));
  await click(translate('gallery.recordingRecovery.download'));
  expect(container.textContent).toContain(entry.filename);
  expect(mocks.remove).not.toHaveBeenCalled();
});
it('requires confirmation, retains a refused deletion and allows retry', async () => {
  mocks.remove.mockRejectedValueOnce(new Error('identity changed'));
  await mount();
  await click(translate('gallery.recordingRecovery.delete'));
  expect(mocks.remove).not.toHaveBeenCalled();
  await act(async () => container.querySelector<HTMLButtonElement>('[data-cancel]')!.click());
  expect(container.querySelector('[role=dialog]')).toBeNull();
  await click(translate('gallery.recordingRecovery.delete'));
  await act(async () => container.querySelector<HTMLButtonElement>('[data-confirm]')!.click());
  expect(container.querySelector('[role=dialog]')?.textContent).toContain(
    translate('gallery.recordingRecovery.actionFailed')
  );
  expect(container.textContent).toContain(entry.filename);
  await act(async () => container.querySelector<HTMLButtonElement>('[data-confirm]')!.click());
  expect(mocks.remove).toHaveBeenLastCalledWith('source', 'one');
  expect(container.textContent).not.toContain(entry.filename);
});
it('rejects duplicate actions while a recovery is pending', async () => {
  let complete: (() => void) | undefined;
  mocks.recover.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        complete = resolve;
      })
  );
  await mount();
  await click(translate('gallery.recordingRecovery.recover'));
  expect(button(translate('gallery.recordingRecovery.download')).disabled).toBe(true);
  await click(translate('gallery.recordingRecovery.recover'));
  expect(mocks.recover).toHaveBeenCalledTimes(1);
  await act(async () => complete?.());
  expect(container.querySelector('[data-ui="gallery.recording-recovery"]')).toBeNull();
  expect(container.textContent).not.toContain(entry.filename);
});
it('shows an unavailable published recording supplied by discovery as recoverable', async () => {
  mocks.list.mockResolvedValue([{ ...entry, complete: true, published: true }]);
  await mount();
  expect(container.textContent).toContain(entry.filename);
  expect(button(translate('gallery.recordingRecovery.recover')).disabled).toBe(false);
});
it('does not flash a recovery panel while checking a healthy library', async () => {
  let finish: ((entries: RecoveryRecording[]) => void) | undefined;
  mocks.list.mockImplementationOnce(
    () =>
      new Promise<RecoveryRecording[]>((resolve) => {
        finish = resolve;
      })
  );
  await mount();
  expect(container.textContent).toBe('');
  await act(async () => finish?.([]));
  expect(container.textContent).toBe('');
});
it('transfers download lifetime and retains entries after interrupted downloads', async () => {
  const resource = {
    file: new File(['bytes'], 'raw.webm'),
    filename: 'raw.webm',
    release: vi.fn(),
  };
  mocks.download.mockResolvedValue(resource);
  await mount();
  await click(translate('gallery.recordingRecovery.download'));
  expect(mocks.launch).toHaveBeenCalledWith(
    resource.file,
    resource.filename,
    resource.release,
    expect.any(Function),
    expect.any(Function)
  );
  await act(async () => mocks.launch.mock.calls[0]![4]('interrupted'));
  expect(container.textContent).toContain(translate('gallery.recordingRecovery.downloadFailed'));
  expect(container.textContent).toContain(entry.filename);
  expect(mocks.remove).not.toHaveBeenCalled();
});
it('releases a late download snapshot after unmount', async () => {
  let complete:
    | ((value: { file: File; filename: string; release(): Promise<void> }) => void)
    | undefined;
  mocks.download.mockImplementation(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      })
  );
  await mount();
  await click(translate('gallery.recordingRecovery.download'));
  await act(async () => root.unmount());
  const release = vi.fn().mockResolvedValue(undefined);
  await act(async () =>
    complete?.({ file: new File(['data'], 'raw.webm'), filename: 'raw.webm', release })
  );
  expect(release).toHaveBeenCalledOnce();
  expect(mocks.launch).not.toHaveBeenCalled();
  root = createRoot(container);
});
