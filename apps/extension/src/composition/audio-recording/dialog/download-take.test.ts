// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { downloadRecordedTake } from './download-take';

const io = vi.hoisted(() => ({
  available: true,
  changed: undefined as ((delta: { id: number; state?: { current: string } }) => void) | undefined,
  created: undefined as
    | ((item: { id: number; url: string; finalUrl?: string }) => void)
    | undefined,
  search: vi.fn(),
  unsubscribe: vi.fn(),
  unsubscribeCreated: vi.fn(),
}));
vi.mock('@sniptale/platform/browser/downloads', () => ({
  browserDownloads: {
    isAvailable: () => io.available,
    search: io.search,
    subscribeToChanged: (callback: typeof io.changed) => {
      io.changed = callback;
      return io.unsubscribe;
    },
    subscribeToCreated: (callback: typeof io.created) => {
      io.created = callback;
      return io.unsubscribeCreated;
    },
  },
}));
const createUrl = vi.fn(() => 'blob:original');
const revoke = vi.fn();
let filename = '';
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  io.available = true;
  io.search.mockResolvedValue([]);
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL = createUrl;
      static revokeObjectURL = revoke;
    }
  );
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(
    function (this: HTMLAnchorElement) {
      filename = this.download;
    }
  );
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  io.created = undefined;
  io.changed = undefined;
});
it.each(['complete', 'interrupted'])('retains original bytes until download %s', async (state) => {
  const take = new Blob(['whole take'], { type: 'audio/webm;codecs=opus' });
  await downloadRecordedTake(take);
  expect(createUrl).toHaveBeenCalledWith(take);
  expect(filename).toMatch(/^audio-\d+\.webm$/);
  expect(revoke).not.toHaveBeenCalled();
  io.created?.({ id: 99, url: 'blob:other' });
  expect(io.changed).toBeUndefined();
  io.created?.({ id: 7, url: 'blob:original' });
  io.changed?.({ id: 99, state: { current: 'complete' } });
  expect(revoke).not.toHaveBeenCalled();
  io.changed?.({ id: 7, state: { current: state } });
  expect(revoke).toHaveBeenCalledOnce();
  expect(io.unsubscribe).toHaveBeenCalledOnce();
  await vi.runAllTimersAsync();
  expect(revoke).toHaveBeenCalledOnce();
});
it('releases a failed launch without dropping or altering the take', async () => {
  const take = new Blob(['whole take'], { type: 'audio/mp4' });
  vi.mocked(HTMLAnchorElement.prototype.click).mockImplementation(() => {
    throw new Error('blocked');
  });
  await expect(downloadRecordedTake(take)).rejects.toThrow('blocked');
  expect(createUrl).toHaveBeenCalledWith(take);
  expect(revoke).toHaveBeenCalledOnce();
  expect(io.unsubscribeCreated).toHaveBeenCalledOnce();
});
it('keeps fallback URL alive after launching the original file', async () => {
  io.available = false;
  await downloadRecordedTake(new Blob(['original'], { type: 'audio/ogg' }));
  expect(filename).toMatch(/\.ogg$/);
  expect(revoke).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(60_000);
  expect(revoke).toHaveBeenCalledOnce();
});
