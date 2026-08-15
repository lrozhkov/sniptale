import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  available: vi.fn(),
  get: vi.fn(),
  remove: vi.fn(),
  set: vi.fn(),
}));

vi.mock('../../../composition/persistence/infrastructure/browser-storage', () => ({
  browserStorage: {
    session: {
      get: mocks.get,
      isAvailable: mocks.available,
      remove: mocks.remove,
      set: mocks.set,
    },
  },
}));

import { readCaptureSurfaceJournal, writeCaptureSurfaceJournal } from '.';

const prior = {
  height: 900,
  left: 0,
  state: 'normal' as const,
  top: 0,
  type: 'window' as const,
  width: 1440,
};
const applied = { ...prior, height: 720, width: 1280 };
const entry = {
  applied,
  generation: 1,
  leaseId: 'lease-1',
  owner: 'screenshot' as const,
  parentLeaseId: null,
  phase: 'applied' as const,
  presetId: 'window-hd',
  prior,
  sessionId: 'session-1',
  tabId: 7,
  target: 'window' as const,
  updatedAt: 100,
  version: 1 as const,
  windowId: 3,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.available.mockReturnValue(true);
  mocks.get.mockResolvedValue({});
  mocks.set.mockResolvedValue(undefined);
});

describe('window-only capture-surface journal', () => {
  it('round-trips a validated browser-window lease', async () => {
    await writeCaptureSurfaceJournal([entry]);
    expect(mocks.set).toHaveBeenCalledWith({ 'capture-surface-journal-v1': [entry] });
    mocks.get.mockResolvedValue({ 'capture-surface-journal-v1': [entry] });
    await expect(readCaptureSurfaceJournal()).resolves.toEqual([entry]);
  });

  it('rejects legacy viewport entries instead of reviving them', async () => {
    mocks.get.mockResolvedValue({
      'capture-surface-journal-v1': [
        {
          ...entry,
          target: 'window',
          prior: { type: 'native', width: 1440, height: 900 },
          applied: { type: 'viewport', presetId: 'legacy', width: 1280, height: 720 },
        },
      ],
    });
    await expect(readCaptureSurfaceJournal()).rejects.toThrow('invalid entry');
  });

  it('rejects malformed entries and duplicate lease identities atomically', async () => {
    mocks.get.mockResolvedValueOnce({
      'capture-surface-journal-v1': [entry, { ...entry, generation: 'stale' }],
    });
    await expect(readCaptureSurfaceJournal()).rejects.toThrow('invalid entry');
    mocks.get.mockResolvedValueOnce({
      'capture-surface-journal-v1': [entry, { ...entry, sessionId: 'session-2', updatedAt: 200 }],
    });
    await expect(readCaptureSurfaceJournal()).rejects.toThrow('invalid graph');
  });

  it('enforces one window owner across tabs', async () => {
    mocks.get.mockResolvedValue({
      'capture-surface-journal-v1': [
        entry,
        { ...entry, leaseId: 'lease-2', sessionId: 'session-2', tabId: 8, updatedAt: 200 },
      ],
    });
    await expect(readCaptureSurfaceJournal()).rejects.toThrow('invalid graph');
  });

  it('blocks mutation when session storage cannot guarantee recovery', async () => {
    mocks.available.mockReturnValue(false);
    await expect(writeCaptureSurfaceJournal([entry])).rejects.toThrow(
      'Session storage is unavailable'
    );
    await expect(readCaptureSurfaceJournal()).resolves.toEqual([]);
  });
});
