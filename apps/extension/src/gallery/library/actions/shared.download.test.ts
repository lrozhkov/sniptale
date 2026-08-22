// @vitest-environment jsdom

import { afterEach, expect, it, vi } from 'vitest';

const downloads = vi.hoisted(() => ({
  changed: undefined as ((delta: { id: number; state?: { current: string } }) => void) | undefined,
  created: undefined as
    | ((item: { finalUrl?: string; id: number; state: string; url: string }) => void)
    | undefined,
  search: vi.fn().mockResolvedValue([{ id: 7, state: 'in_progress' }]),
}));

vi.mock('@sniptale/platform/browser/downloads', () => ({
  browserDownloads: {
    isAvailable: () => true,
    search: downloads.search,
    subscribeToChanged: (listener: typeof downloads.changed) => {
      downloads.changed = listener;
      return () => {
        downloads.changed = undefined;
      };
    },
    subscribeToCreated: (listener: typeof downloads.created) => {
      downloads.created = listener;
      return () => {
        downloads.created = undefined;
      };
    },
  },
}));

import { downloadBlob } from './shared';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  downloads.changed = undefined;
  downloads.created = undefined;
  downloads.search.mockClear();
});

it('keeps the Blob URL and backing OPFS file until Chrome reports terminal download state', async () => {
  vi.useFakeTimers();
  const release = vi.fn().mockResolvedValue(undefined);
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:backup');
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

  downloadBlob(new Blob(['zip']), 'backup.zip', release);

  expect(revoke).not.toHaveBeenCalled();
  expect(release).not.toHaveBeenCalled();
  downloads.created?.({ id: 7, state: 'in_progress', url: 'blob:backup' });
  await Promise.resolve();
  await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
  expect(release).not.toHaveBeenCalled();

  downloads.changed?.({ id: 7, state: { current: 'complete' } });
  await Promise.resolve();

  expect(revoke).toHaveBeenCalledWith('blob:backup');
  expect(release).toHaveBeenCalledOnce();
});

it('surfaces persistent backing-file cleanup failure after terminal download state', async () => {
  const releaseError = new Error('persistent OPFS cleanup failure');
  const release = vi.fn().mockRejectedValue(releaseError);
  const onReleaseError = vi.fn();
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:backup-failure');
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

  downloadBlob(new Blob(['zip']), 'backup.zip', release, onReleaseError);
  downloads.created?.({ id: 8, state: 'in_progress', url: 'blob:backup-failure' });
  downloads.changed?.({ id: 8, state: { current: 'interrupted' } });

  await vi.waitFor(() => expect(onReleaseError).toHaveBeenCalledWith(releaseError));
  expect(release).toHaveBeenCalledOnce();
});
