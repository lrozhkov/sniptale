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

const entry = {
  version: 1 as const,
  sessionId: 'session-1',
  leaseId: 'lease-1',
  generation: 1,
  owner: 'screenshot' as const,
  tabId: 7,
  windowId: 3,
  presetId: 'preset-1',
  target: 'viewport' as const,
  prior: { type: 'native' as const, width: 1440, height: 900 },
  applied: {
    type: 'viewport' as const,
    presetId: 'preset-1',
    width: 1280,
    height: 720,
  },
  phase: 'prepared' as const,
  parentLeaseId: null,
  updatedAt: 100,
};

function nestedEntry(overrides: Record<string, unknown> = {}) {
  return {
    ...entry,
    sessionId: 'session-2',
    leaseId: 'lease-2',
    presetId: 'preset-2',
    prior: entry.applied,
    applied: {
      type: 'viewport' as const,
      presetId: 'preset-2',
      width: 1024,
      height: 640,
    },
    phase: 'applied' as const,
    parentLeaseId: entry.leaseId,
    updatedAt: 200,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.available.mockReturnValue(true);
  mocks.get.mockResolvedValue({});
  mocks.set.mockResolvedValue(undefined);
});

describe('capture-surface session journal', () => {
  it('round-trips validated write-ahead entries', async () => {
    await writeCaptureSurfaceJournal([entry]);
    expect(mocks.set).toHaveBeenCalledWith({ 'capture-surface-journal-v1': [entry] });

    mocks.get.mockResolvedValue({ 'capture-surface-journal-v1': [entry] });
    await expect(readCaptureSurfaceJournal()).resolves.toEqual([entry]);
  });

  it('round-trips fractional native CDP metrics without weakening preset dimensions', async () => {
    const fractionalNative = {
      ...entry,
      prior: { type: 'native' as const, width: 1439.5, height: 899.25 },
    };
    mocks.get.mockResolvedValue({ 'capture-surface-journal-v1': [fractionalNative] });
    await expect(readCaptureSurfaceJournal()).resolves.toEqual([fractionalNative]);

    mocks.get.mockResolvedValue({
      'capture-surface-journal-v1': [{ ...entry, applied: { ...entry.applied, width: 1279.5 } }],
    });
    await expect(readCaptureSurfaceJournal()).rejects.toThrow('invalid entry');
  });

  it('rejects the whole persisted journal when one entry is malformed', async () => {
    mocks.get.mockResolvedValue({
      'capture-surface-journal-v1': [entry, { ...entry, generation: 'stale' }],
    });
    await expect(readCaptureSurfaceJournal()).rejects.toThrow('invalid entry');
  });

  it.each([-1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    'rejects a non-monotonic-safe journal revision %s',
    async (updatedAt) => {
      mocks.get.mockResolvedValue({
        'capture-surface-journal-v1': [{ ...entry, updatedAt }],
      });

      await expect(readCaptureSurfaceJournal()).rejects.toThrow('invalid entry');
    }
  );

  it('accepts valid nested stacks and retryable top phases', async () => {
    const parent = { ...entry, phase: 'suspended' as const };
    for (const phase of ['applied', 'prepared', 'releasing', 'conflict'] as const) {
      const child = nestedEntry({ phase });
      mocks.get.mockResolvedValueOnce({ 'capture-surface-journal-v1': [parent, child] });
      await expect(readCaptureSurfaceJournal()).resolves.toEqual([parent, child]);
    }

    const suspendedCrash = { ...entry, phase: 'suspended' as const };
    mocks.get.mockResolvedValueOnce({ 'capture-surface-journal-v1': [suspendedCrash] });
    await expect(readCaptureSurfaceJournal()).resolves.toEqual([suspendedCrash]);

    const mixedTargetChild = {
      ...nestedEntry(),
      target: 'window' as const,
      prior: {
        type: 'window' as const,
        left: 0,
        top: 0,
        width: 1440,
        height: 900,
        state: 'normal' as const,
      },
      applied: {
        type: 'window' as const,
        left: 0,
        top: 0,
        width: 1280,
        height: 720,
        state: 'normal' as const,
      },
    };
    mocks.get.mockResolvedValueOnce({
      'capture-surface-journal-v1': [parent, mixedTargetChild],
    });
    await expect(readCaptureSurfaceJournal()).resolves.toEqual([parent, mixedTargetChild]);
  });

  it('atomically rejects duplicate IDs and broken per-tab parent chains', async () => {
    const corruptions = [
      [entry, { ...entry, sessionId: 'session-2', updatedAt: 200 }],
      [{ ...entry, parentLeaseId: 'missing-parent' }],
      [{ ...entry, phase: 'suspended' as const }, nestedEntry({ parentLeaseId: null })],
      [entry, nestedEntry()],
      [{ ...entry, phase: 'suspended' as const }, nestedEntry({ tabId: 8 })],
      [{ ...entry, phase: 'suspended' as const }, nestedEntry({ updatedAt: 100 })],
      [
        { ...entry, phase: 'suspended' as const },
        nestedEntry({ prior: { type: 'native' as const, width: 999, height: 777 } }),
      ],
    ];

    for (const journal of corruptions) {
      mocks.get.mockResolvedValueOnce({ 'capture-surface-journal-v1': journal });
      await expect(readCaptureSurfaceJournal()).rejects.toThrow('invalid graph');
    }
  });

  it('atomically rejects impossible stack phases and applied snapshot identities', async () => {
    const corruptions = [
      [entry, nestedEntry()],
      [{ ...entry, applied: { ...entry.applied, presetId: 'wrong-preset' } }],
      [{ ...entry, target: 'window' as const }],
      [
        {
          ...entry,
          applied: {
            type: 'window' as const,
            left: 0,
            top: 0,
            width: 1280,
            height: 720,
            state: 'normal' as const,
          },
        },
      ],
    ];

    for (const journal of corruptions) {
      mocks.get.mockResolvedValueOnce({ 'capture-surface-journal-v1': journal });
      await expect(readCaptureSurfaceJournal()).rejects.toThrow('invalid graph');
    }
  });

  it('enforces window exclusivity across tabs without blocking viewport-only siblings', async () => {
    const siblingViewport = {
      ...entry,
      sessionId: 'session-2',
      leaseId: 'lease-2',
      tabId: 8,
      updatedAt: 200,
    };
    mocks.get.mockResolvedValueOnce({
      'capture-surface-journal-v1': [entry, siblingViewport],
    });
    await expect(readCaptureSurfaceJournal()).resolves.toEqual([entry, siblingViewport]);

    const windowLease = {
      ...entry,
      target: 'window' as const,
      prior: {
        type: 'window' as const,
        left: 0,
        top: 0,
        width: 1440,
        height: 900,
        state: 'normal' as const,
      },
      applied: {
        type: 'window' as const,
        left: 0,
        top: 0,
        width: 1280,
        height: 720,
        state: 'normal' as const,
      },
    };
    mocks.get.mockResolvedValueOnce({
      'capture-surface-journal-v1': [windowLease, siblingViewport],
    });
    await expect(readCaptureSurfaceJournal()).rejects.toThrow('invalid graph');
  });

  it('blocks mutation when session storage cannot provide recovery durability', async () => {
    mocks.available.mockReturnValue(false);
    await expect(writeCaptureSurfaceJournal([entry])).rejects.toThrow(
      'Session storage is unavailable'
    );
    await expect(readCaptureSurfaceJournal()).resolves.toEqual([]);
  });
});
