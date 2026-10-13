import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { browserTabs } from '@sniptale/platform/browser/tabs';
import {
  createRecordingFrameClockCompanion,
  closeRecordingFrameClockCompanions,
} from './frame-clock-companion';
import {
  RECORDING_FRAME_CLOCK_LEASE_MS,
  RECORDING_FRAME_CLOCK_PURPOSE,
} from '../../../../contracts/video/recording-frame-clock';

const binding = { recordingId: 'recording', generation: 2, streamInstanceId: 'source' };
let created: chrome.tabs.Tab;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('chrome', {
    runtime: { getURL: (path: string) => `chrome-extension://test/${path}` },
  });
  vi.spyOn(browserTabs, 'query').mockResolvedValue([]);
  vi.spyOn(browserTabs, 'create').mockImplementation(async ({ url }) => {
    created = { id: 42, url } as chrome.tabs.Tab;
    return created;
  });
  vi.spyOn(browserTabs, 'get').mockImplementation(async () => created);
  vi.spyOn(browserTabs, 'remove').mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('temporary exact-frame renderer resource', () => {
  it('acquires an inactive source-scoped helper and closes it promptly on an owned result', async () => {
    const lease = await createRecordingFrameClockCompanion(binding);
    expect(lease).toMatchObject(binding);
    expect(browserTabs.create).toHaveBeenCalledWith(expect.objectContaining({ active: false }));
    expect(created.url).toContain('apps/extension/src/recording-clock/index.html#');
    vi.mocked(browserTabs.query).mockResolvedValue([
      created,
      { id: 8, url: 'https://example.com/' } as chrome.tabs.Tab,
    ]);
    await closeRecordingFrameClockCompanions(binding.recordingId);
    expect(browserTabs.remove).toHaveBeenCalledExactlyOnceWith(42);
  });

  it('never closes a user tab that replaces the issued helper before its deadline', async () => {
    await createRecordingFrameClockCompanion(binding);
    created = { id: 42, url: 'https://example.com/' } as chrome.tabs.Tab;
    await vi.advanceTimersByTimeAsync(RECORDING_FRAME_CLOCK_LEASE_MS);
    expect(browserTabs.remove).not.toHaveBeenCalled();
  });

  it('limits unavailable helper lifetime and settles already-closed resources', async () => {
    await createRecordingFrameClockCompanion(binding);
    await vi.advanceTimersByTimeAsync(RECORDING_FRAME_CLOCK_LEASE_MS);
    expect(browserTabs.remove).toHaveBeenCalledExactlyOnceWith(42);
    vi.mocked(browserTabs.get).mockRejectedValueOnce(new Error('No tab'));
    vi.mocked(browserTabs.query).mockResolvedValue([created]);
    await expect(closeRecordingFrameClockCompanions(binding.recordingId)).resolves.toBeUndefined();
  });

  it('reports optional acquisition failure without failing primary recording admission', async () => {
    vi.mocked(browserTabs.create).mockRejectedValueOnce(new Error('Cannot create helper'));
    await expect(createRecordingFrameClockCompanion(binding)).resolves.toBeNull();
    expect(browserTabs.remove).not.toHaveBeenCalled();
  });
});
it('restart cleanup removes only expired issued helpers and accepts pending URLs', async () => {
  const expired = {
    ...binding,
    purpose: RECORDING_FRAME_CLOCK_PURPOSE,
    nonce: crypto.randomUUID(),
    expiresAtEpochMs: Date.now() - 1,
  };
  const base = 'chrome-extension://test/apps/extension/src/recording-clock/index.html';
  const old = {
    id: 41,
    pendingUrl: `${base}#${encodeURIComponent(JSON.stringify(expired))}`,
  } as chrome.tabs.Tab;
  vi.mocked(browserTabs.query).mockResolvedValue([
    old,
    { id: 10, url: `${base}?unknown=1#bad` } as chrome.tabs.Tab,
    { id: 11, url: `${base}#malformed` } as chrome.tabs.Tab,
    { id: 12 } as chrome.tabs.Tab,
  ]);
  vi.mocked(browserTabs.get).mockImplementation(async (id) => (id === 41 ? old : created));
  const next = await createRecordingFrameClockCompanion(binding);
  expect(next).not.toBeNull();
  expect(browserTabs.remove).toHaveBeenCalledExactlyOnceWith(41);
  await closeRecordingFrameClockCompanions(null);
  expect(browserTabs.remove).toHaveBeenCalledOnce();
});
it('missing tab identity and refused inventory never claim a helper lease', async () => {
  vi.mocked(browserTabs.create).mockResolvedValueOnce({} as chrome.tabs.Tab);
  await expect(createRecordingFrameClockCompanion(binding)).resolves.toBeNull();
  vi.mocked(browserTabs.query).mockRejectedValueOnce(new Error('inventory unavailable'));
  await expect(closeRecordingFrameClockCompanions(binding.recordingId)).resolves.toBeUndefined();
  expect(browserTabs.remove).not.toHaveBeenCalled();
});
