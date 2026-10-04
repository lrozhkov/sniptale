import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CaptureSurfaceMutationError } from './types';

const mocks = vi.hoisted(() => ({
  applyPreparedWindowSize: vi.fn(),
  getTab: vi.fn(),
  getWindowSnapshot: vi.fn(),
  getWindowWorkArea: vi.fn(),
  loadSettings: vi.fn(),
  prepareWindowSize: vi.fn(),
  readJournal: vi.fn(),
  restoreWindowSnapshot: vi.fn(),
  subscribeBoundsChanged: vi.fn((_listener?: (window: { id?: number }) => void) => vi.fn()),
  writeJournal: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/tabs', () => ({ browserTabs: { get: mocks.getTab } }));
vi.mock('@sniptale/platform/browser/windows', () => ({
  browserWindows: { subscribeBoundsChanged: mocks.subscribeBoundsChanged },
}));
vi.mock('../../composition/persistence/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../composition/persistence/settings')>()),
  loadSettings: mocks.loadSettings,
}));
vi.mock('../storage/capture-surface', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../storage/capture-surface')>()),
  readCaptureSurfaceJournal: mocks.readJournal,
  writeCaptureSurfaceJournal: mocks.writeJournal,
}));
vi.mock('./window', () => ({
  applyPreparedWindowSize: mocks.applyPreparedWindowSize,
  getWindowSnapshot: mocks.getWindowSnapshot,
  getWindowWorkArea: mocks.getWindowWorkArea,
  prepareWindowSize: mocks.prepareWindowSize,
  restoreWindowSnapshot: mocks.restoreWindowSnapshot,
  windowSnapshotsEqual: (left: unknown, right: unknown) =>
    JSON.stringify(left) === JSON.stringify(right),
}));

import { DefaultCaptureSurfaceService } from './service';

const preset = {
  enabled: true,
  height: 720,
  id: 'window-hd',
  kind: 'user' as const,
  name: 'Window HD',
  order: 0,
  target: 'window' as const,
  width: 1280,
};
const prior = {
  height: 900,
  left: -1440,
  state: 'normal' as const,
  top: 0,
  type: 'window' as const,
  width: 1440,
};
const applied = { ...prior, height: 720, width: 1280 };

beforeEach(() => {
  vi.clearAllMocks();
  let leaseSequence = 0;
  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => `lease-${(leaseSequence += 1)}`) });
  mocks.loadSettings.mockResolvedValue({ viewportPresets: [preset] });
  mocks.getTab.mockResolvedValue({ id: 7, windowId: 3 });
  mocks.getWindowWorkArea.mockResolvedValue({
    snapshot: prior,
    workArea: { height: 1040, left: -1920, top: 0, width: 1920 },
  });
  mocks.prepareWindowSize.mockResolvedValue({ expected: applied, prior });
  mocks.applyPreparedWindowSize.mockResolvedValue(applied);
  mocks.getWindowSnapshot.mockResolvedValue(applied);
  mocks.restoreWindowSnapshot.mockResolvedValue(undefined);
  mocks.readJournal.mockResolvedValue([]);
  mocks.writeJournal.mockResolvedValue(undefined);
});

function request(overrides: Record<string, unknown> = {}) {
  return {
    context: 'screenshot' as const,
    generation: 1,
    owner: 'screenshot' as const,
    presetId: preset.id,
    sessionId: 'session-1',
    tabId: 7,
    ...overrides,
  };
}

describe('window-only preset ownership', () => {
  it('journals the normalized intermediate before applying final bounds', async () => {
    const maximized = { ...prior, state: 'maximized' as const };
    const normalized = { ...prior, state: 'normal' as const };
    mocks.prepareWindowSize.mockResolvedValueOnce({ expected: applied, prior: maximized });
    mocks.applyPreparedWindowSize.mockImplementationOnce(
      async (_id, _prior, _expected, onNormalized) => {
        await onNormalized(normalized);
        expect(mocks.writeJournal.mock.calls.at(-1)?.[0]?.[0]?.alignmentFrom).toEqual(normalized);
        return applied;
      }
    );

    await new DefaultCaptureSurfaceService().apply(request());
    expect(mocks.writeJournal.mock.calls.at(-1)?.[0]?.[0]).not.toHaveProperty('alignmentFrom');
  });

  it('admits only the browser-window preset and journals before changing bounds', async () => {
    const service = new DefaultCaptureSurfaceService();
    await expect(service.apply(request())).resolves.toMatchObject({
      height: 720,
      presetId: preset.id,
      target: 'window',
      width: 1280,
    });
    expect(mocks.writeJournal.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.applyPreparedWindowSize.mock.invocationCallOrder[0]!
    );
    expect(mocks.writeJournal.mock.calls.at(-1)?.[0]?.[0]).toMatchObject({
      applied,
      prior,
      target: 'window',
      phase: 'applied',
    });
  });

  it('restores the exact prior window and clears the journal on release', async () => {
    const service = new DefaultCaptureSurfaceService();
    const binding = await service.apply(request());
    await service.release(binding);
    expect(mocks.restoreWindowSnapshot).toHaveBeenCalledWith(3, prior);
    expect(mocks.writeJournal.mock.calls.at(-1)?.[0]).toEqual([]);
    expect(service.getApplied(7)).toBeNull();
  });

  it('journals Chrome-adjusted coordinates and restores only while they remain owned', async () => {
    const observed = { ...applied, left: applied.left + 8, top: applied.top + 8 };
    mocks.applyPreparedWindowSize.mockResolvedValueOnce(observed);
    mocks.getWindowSnapshot.mockResolvedValue(observed);
    const service = new DefaultCaptureSurfaceService();
    const binding = await service.apply(request());

    expect(mocks.writeJournal.mock.calls.at(-1)?.[0]?.[0]?.applied).toEqual(observed);
    await service.release(binding);
    expect(mocks.restoreWindowSnapshot).toHaveBeenCalledWith(3, prior);

    mocks.applyPreparedWindowSize.mockResolvedValueOnce(observed);
    const second = await service.apply(request({ generation: 2 }));
    mocks.getWindowSnapshot.mockResolvedValueOnce({ ...observed, left: observed.left + 1 });
    await expect(service.release(second)).rejects.toMatchObject({ code: 'restore-conflict' });
  });

  it('restores observed coordinates if journaling the adjusted position fails', async () => {
    const observed = { ...applied, left: applied.left + 8 };
    mocks.applyPreparedWindowSize.mockResolvedValueOnce(observed);
    mocks.getWindowSnapshot.mockResolvedValue(observed);
    mocks.writeJournal
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('storage failed'));

    await expect(new DefaultCaptureSurfaceService().apply(request())).rejects.toThrow(
      'storage failed'
    );
    expect(mocks.restoreWindowSnapshot).toHaveBeenCalledWith(3, prior);
    expect(mocks.writeJournal.mock.calls.at(-1)?.[0]).toEqual([]);
  });

  it('fails closed when the user changes the owned window before release', async () => {
    const service = new DefaultCaptureSurfaceService();
    const binding = await service.apply(request());
    mocks.getWindowSnapshot.mockResolvedValueOnce({ ...applied, width: 1279 });
    await expect(service.release(binding)).rejects.toMatchObject({ code: 'restore-conflict' });
    expect(mocks.restoreWindowSnapshot).not.toHaveBeenCalled();
  });

  it('releases a conflicted screenshot owner without restoring user-changed bounds', async () => {
    const service = new DefaultCaptureSurfaceService();
    await service.apply(request());
    mocks.getWindowSnapshot.mockResolvedValue({ ...applied, width: 1279 });

    await expect(service.releaseTabOwners(7, ['screenshot'])).resolves.toBeUndefined();
    expect(mocks.restoreWindowSnapshot).not.toHaveBeenCalled();
    expect(mocks.writeJournal.mock.calls.at(-1)?.[0]).toEqual([]);
    expect(service.hasOwnerLease('screenshot')).toBe(false);
  });

  it('rejects a second tab trying to own the same browser window', async () => {
    const service = new DefaultCaptureSurfaceService();
    await service.apply(request());
    mocks.getTab.mockResolvedValueOnce({ id: 8, windowId: 3 });
    await expect(
      service.apply(request({ generation: 1, sessionId: 'session-2', tabId: 8 }))
    ).rejects.toMatchObject({ code: 'surface-busy' });
  });
});

describe('window-only lease failure and stacking', () => {
  it('rolls back a partially observed window mutation and preserves the typed failure', async () => {
    const observed = { ...applied, width: 1200 };
    mocks.applyPreparedWindowSize.mockRejectedValueOnce(
      new CaptureSurfaceMutationError('verification-failed', observed)
    );
    mocks.getWindowSnapshot.mockResolvedValueOnce(observed);
    const service = new DefaultCaptureSurfaceService();

    await expect(service.apply(request())).rejects.toMatchObject({ code: 'verification-failed' });
    expect(mocks.restoreWindowSnapshot).toHaveBeenCalledWith(3, prior);
    expect(mocks.writeJournal.mock.calls.at(-1)?.[0]).toEqual([]);
  });

  it('normalizes platform mutation failures after a successful rollback', async () => {
    mocks.applyPreparedWindowSize.mockRejectedValueOnce('native window update rejected');
    mocks.getWindowSnapshot.mockResolvedValueOnce(applied);
    const service = new DefaultCaptureSurfaceService();

    await expect(service.apply(request())).rejects.toMatchObject({
      code: 'platform-rejected',
      message: 'native window update rejected',
    });
  });

  it('reports rollback restoration failure instead of masking it with the apply failure', async () => {
    mocks.applyPreparedWindowSize.mockRejectedValueOnce(new Error('window-too-large'));
    mocks.getWindowSnapshot.mockResolvedValueOnce(applied);
    mocks.restoreWindowSnapshot.mockRejectedValueOnce(new Error('window vanished'));
    const service = new DefaultCaptureSurfaceService();

    await expect(service.apply(request())).rejects.toMatchObject({ code: 'restore-impossible' });
    expect(mocks.writeJournal.mock.calls.at(-1)?.[0]?.[0]).toMatchObject({ phase: 'conflict' });
  });

  it('atomically replaces the current lease without retaining a suspended parent', async () => {
    const service = new DefaultCaptureSurfaceService();
    await service.apply(request());
    mocks.prepareWindowSize.mockResolvedValueOnce({ expected: applied, prior: applied });
    const replacement = await service.replace(request({ generation: 2 }));

    expect(service.getAppliedForSession('session-1')).toEqual(replacement);
    expect(mocks.writeJournal.mock.calls.at(-1)?.[0]).toHaveLength(1);
    await expect(service.release(replacement)).resolves.toBeUndefined();
    expect(mocks.restoreWindowSnapshot).toHaveBeenLastCalledWith(3, prior);
  });

  it('resumes a parent lease after a nested quick-action lease is released', async () => {
    const service = new DefaultCaptureSurfaceService();
    const parent = await service.apply(request());
    mocks.prepareWindowSize.mockResolvedValueOnce({ expected: applied, prior: applied });
    const child = await service.apply(
      request({ generation: 1, owner: 'quick-action', sessionId: 'quick-1' })
    );

    await service.release(child);
    expect(service.getApplied(7)).toEqual(parent);
    expect(service.hasOwnerLease('screenshot')).toBe(true);
  });

  it('abandons every suspended owner after a nested window is changed externally', async () => {
    const service = new DefaultCaptureSurfaceService();
    await service.apply(request());
    mocks.prepareWindowSize.mockResolvedValueOnce({ expected: applied, prior: applied });
    const child = await service.apply(
      request({ generation: 1, owner: 'video', sessionId: 'recording-1' })
    );
    mocks.getWindowSnapshot.mockResolvedValue({ ...applied, width: 1279 });

    await expect(service.release(child)).rejects.toMatchObject({ code: 'restore-conflict' });
    await service.abandonConflicted(child);

    expect(mocks.restoreWindowSnapshot).not.toHaveBeenCalled();
    expect(service.hasOwnerLease('video')).toBe(false);
    expect(service.hasOwnerLease('screenshot')).toBe(false);
    expect(mocks.writeJournal.mock.calls.at(-1)?.[0]).toEqual([]);
  });
});

it('applies and restores a browser window lease for desktop capture', async () => {
  const service = new DefaultCaptureSurfaceService();
  const surface = await service.apply(request({ owner: 'video', context: 'video-screen' }));
  expect(mocks.applyPreparedWindowSize).toHaveBeenCalled();
  await service.release(surface);
  expect(mocks.restoreWindowSnapshot).toHaveBeenCalledWith(3, prior);
});
it('rejects desktop resize if the initiating browser window no longer exists', async () => {
  mocks.getTab.mockRejectedValue(new Error('closed'));
  const service = new DefaultCaptureSurfaceService();
  await expect(
    service.apply(request({ owner: 'video', context: 'video-screen' }))
  ).rejects.toMatchObject({ code: 'unsupported-context' });
  expect(mocks.applyPreparedWindowSize).not.toHaveBeenCalled();
});
