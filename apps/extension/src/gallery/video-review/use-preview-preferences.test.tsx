// @vitest-environment jsdom
import { act, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_QUICK_PREVIEW_PREFERENCES } from '../../features/video/preview/quick-preferences';
import type { QuickPreviewPreferencesStorage } from '../../composition/persistence/quick-preview-preferences/storage';
import { useReviewPreviewPreferences } from './use-preview-preferences';

let root: Root;
let host: HTMLDivElement;
let current: ReturnType<typeof useReviewPreviewPreferences>;
const saved = { ...DEFAULT_QUICK_PREVIEW_PREFERENCES, frameRate: '30' as const };
const loaded = { preferences: saved, invalidFieldCount: 0 };
function Harness({ storage }: { storage: QuickPreviewPreferencesStorage }) {
  current = useReviewPreviewPreferences(storage);
  return null;
}
async function mount(storage: QuickPreviewPreferencesStorage, strict = false) {
  await act(async () => {
    root.render(
      strict ? (
        <StrictMode>
          <Harness storage={storage} />
        </StrictMode>
      ) : (
        <Harness storage={storage} />
      )
    );
  });
}
beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

it('loads retained preferences without writing defaults or repaired data', async () => {
  const storage = {
    load: vi.fn().mockResolvedValue({ ...loaded, invalidFieldCount: 1 }),
    save: vi.fn(),
  };
  await mount(storage);
  expect(current.preferences).toEqual(saved);
  expect(current.status).toBe('ready');
  expect(storage.save).not.toHaveBeenCalled();
});

it.each(['change', 'reset'] as const)(
  'keeps explicit %s when hydration finishes late',
  async (action) => {
    const read =
      Promise.withResolvers<Awaited<ReturnType<QuickPreviewPreferencesStorage['load']>>>();
    const storage = { load: vi.fn(() => read.promise), save: vi.fn().mockResolvedValue(undefined) };
    await mount(storage);
    await act(async () => {
      if (action === 'change') current.change({ rasterPreset: '540p' });
      else current.reset();
    });
    const selected = current.preferences;
    await act(async () => read.resolve(loaded));
    expect(current.preferences).toEqual(selected);
    expect(current.status).toBe('ready');
    expect(storage.save).toHaveBeenCalledOnce();
  }
);

it('combines immediate edits and ignores an older save failure', async () => {
  const first = Promise.withResolvers<void>();
  const second = Promise.withResolvers<void>();
  const storage = {
    load: vi.fn().mockResolvedValue(loaded),
    save: vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise),
  };
  await mount(storage);
  await act(async () => {
    current.change({ rasterPreset: '720p' });
    current.change({ showFrameRate: true });
  });
  expect(current.preferences).toEqual({ ...saved, rasterPreset: '720p', showFrameRate: true });
  await act(async () => second.resolve());
  await act(async () => first.reject(new Error('old failure')));
  expect(current.status).toBe('ready');
  expect(storage.save.mock.calls[1]?.[0]).toEqual(current.preferences);
});

it('keeps latest failure after an older save succeeds and retries current selection', async () => {
  const first = Promise.withResolvers<void>();
  const second = Promise.withResolvers<void>();
  const storage = {
    load: vi.fn().mockResolvedValue(loaded),
    save: vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
      .mockResolvedValue(undefined),
  };
  await mount(storage);
  await act(async () => current.change({ frameRate: '15' }));
  await act(async () => current.change({ pausedQuality: 'detailed' }));
  await act(async () => second.reject(new Error('quota')));
  await act(async () => first.resolve());
  expect(current.status).toBe('session-only');
  expect(current.preferences).toEqual({ ...saved, frameRate: '15', pausedQuality: 'detailed' });
  await act(async () => current.retry());
  expect(current.status).toBe('ready');
  expect(storage.save.mock.calls[2]?.[0]).toEqual(current.preferences);
});

it('keeps defaults editable when storage is unavailable', async () => {
  const storage = {
    load: vi.fn().mockRejectedValue(new Error('unavailable')),
    save: vi.fn().mockRejectedValue(new Error('unavailable')),
  };
  await mount(storage);
  expect(current.status).toBe('session-only');
  expect(current.preferences).toEqual(DEFAULT_QUICK_PREVIEW_PREFERENCES);
  await act(async () => current.change({ frameRate: '24' }));
  expect(current.preferences.frameRate).toBe('24');
  expect(current.status).toBe('session-only');
  expect(storage.save).toHaveBeenCalledOnce();
});

it('discards a previous effect lifetime under StrictMode', async () => {
  const first =
    Promise.withResolvers<Awaited<ReturnType<QuickPreviewPreferencesStorage['load']>>>();
  const storage = {
    load: vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValue({ preferences: DEFAULT_QUICK_PREVIEW_PREFERENCES, invalidFieldCount: 0 }),
    save: vi.fn(),
  };
  await mount(storage, true);
  await act(async () => first.resolve(loaded));
  expect(current.preferences).toEqual(DEFAULT_QUICK_PREVIEW_PREFERENCES);
  expect(storage.save).not.toHaveBeenCalled();
});

it('does not submit retained callbacks after disposal', async () => {
  const read = Promise.withResolvers<Awaited<ReturnType<QuickPreviewPreferencesStorage['load']>>>();
  const storage = { load: vi.fn(() => read.promise), save: vi.fn() };
  await mount(storage);
  const detached = current;
  await act(async () => root.unmount());
  await act(async () => {
    read.resolve(loaded);
    detached.change({ frameRate: '60' });
    detached.retry();
  });
  expect(storage.save).not.toHaveBeenCalled();
});
