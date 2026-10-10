// @vitest-environment jsdom

import { afterEach, expect, it, vi } from 'vitest';

const downloads = vi.hoisted(() => ({
  available: true,
  changed: undefined as ((delta: { id: number; state?: { current: string } }) => void) | undefined,
  created: undefined as
    | ((item: { finalUrl?: string; id: number; state: string; url: string }) => void)
    | undefined,
  search: vi.fn().mockResolvedValue([{ id: 7, state: 'in_progress' }]),
}));

vi.mock('@sniptale/platform/browser/downloads', () => ({
  browserDownloads: {
    isAvailable: () => downloads.available,
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
  downloads.available = true;
});

it('reports completion once even when terminal search and event both arrive', async () => {
  downloads.search.mockResolvedValueOnce([{ id: 10, state: 'complete' }]);
  const state = vi.fn();
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:subtitles');
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  downloadBlob(new Blob(['WEBVTT']), 'subtitles.vtt', undefined, undefined, state);
  downloads.created?.({ id: 10, state: 'in_progress', url: 'blob:subtitles' });
  await vi.waitFor(() => expect(state).toHaveBeenCalledWith('complete'));
  downloads.changed?.({ id: 10, state: { current: 'interrupted' } });
  expect(state).toHaveBeenCalledOnce();
  expect(revoke).toHaveBeenCalledOnce();
});

it('reports interrupted download separately from failed backing-file release', async () => {
  const state = vi.fn();
  const releaseError = vi.fn();
  const release = vi.fn().mockRejectedValue(new Error('retention failure'));
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:interrupted');
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  downloadBlob(new Blob(['SRT']), 'subtitles.srt', release, releaseError, state);
  downloads.created?.({ id: 11, state: 'in_progress', finalUrl: 'blob:interrupted', url: 'other' });
  downloads.changed?.({ id: 12, state: { current: 'complete' } });
  expect(state).not.toHaveBeenCalled();
  downloads.changed?.({ id: 11, state: { current: 'interrupted' } });
  expect(state).toHaveBeenCalledExactlyOnceWith('interrupted');
  await vi.waitFor(() => expect(releaseError).toHaveBeenCalledOnce());
});

it('releases a failed click immediately and reports unconfirmed fallback honestly', async () => {
  vi.useFakeTimers();
  const state = vi.fn();
  const release = vi.fn();
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:click-failure');
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementationOnce(() => {
    throw new Error('blocked');
  });
  expect(() => downloadBlob(new Blob(['vtt']), 'subtitles.vtt', release, undefined, state)).toThrow(
    'blocked'
  );
  expect(state).toHaveBeenCalledExactlyOnceWith('interrupted');
  await Promise.resolve();
  expect(release).toHaveBeenCalledOnce();
  expect(revoke).toHaveBeenCalledOnce();
  downloads.available = false;
  click.mockImplementation(() => undefined);
  state.mockClear();
  downloadBlob(new Blob(['vtt']), 'subtitles.vtt', undefined, undefined, state);
  await vi.advanceTimersByTimeAsync(1000);
  expect(state).toHaveBeenCalledExactlyOnceWith('unconfirmed');
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

it('releases a download lease at the bounded deadline when Chrome emits no events', async () => {
  vi.useFakeTimers();
  const release = vi.fn().mockResolvedValue(undefined);
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:orphaned-download');
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

  downloadBlob(new Blob(['zip']), 'backup.zip', release);
  await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);

  expect(revoke).toHaveBeenCalledOnce();
  expect(release).toHaveBeenCalledOnce();
  downloads.created?.({ id: 9, state: 'in_progress', url: 'blob:orphaned-download' });
  downloads.changed?.({ id: 9, state: { current: 'complete' } });
  await Promise.resolve();
  expect(release).toHaveBeenCalledOnce();
});
