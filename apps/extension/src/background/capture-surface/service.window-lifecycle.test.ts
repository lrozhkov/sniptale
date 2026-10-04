import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CaptureSurfaceError } from './types';

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

function journalEntry(overrides: Record<string, unknown> = {}) {
  return {
    applied,
    generation: 1,
    leaseId: 'recovered-lease',
    owner: 'video' as const,
    parentLeaseId: null,
    phase: 'applied' as const,
    presetId: preset.id,
    prior,
    sessionId: 'recovered-session',
    tabId: 7,
    target: 'window' as const,
    updatedAt: 1,
    version: 1 as const,
    windowId: 3,
    ...overrides,
  };
}

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

describe('window-only capture-surface recovery', () => {
  it('restores a maximized window interrupted after observing normal bounds', async () => {
    const maximized = { ...prior, state: 'maximized' as const };
    const normalized = { ...prior, state: 'normal' as const };
    mocks.readJournal.mockResolvedValueOnce([
      journalEntry({ prior: maximized, alignmentFrom: normalized, phase: 'prepared' }),
    ]);
    mocks.getWindowSnapshot.mockResolvedValue(normalized);

    await new DefaultCaptureSurfaceService().recover();
    expect(mocks.restoreWindowSnapshot).toHaveBeenCalledWith(3, maximized);
    expect(mocks.writeJournal.mock.calls.at(-1)?.[0]).toEqual([]);
  });

  it('preserves user-changed bounds during interrupted alignment recovery', async () => {
    mocks.readJournal.mockResolvedValueOnce([
      journalEntry({
        phase: 'prepared',
        alignmentFrom: applied,
        applied: { ...applied, height: 719 },
      }),
    ]);
    mocks.getWindowSnapshot.mockResolvedValue({ ...applied, width: 1000 });
    const service = new DefaultCaptureSurfaceService();
    await service.recover();
    expect(mocks.restoreWindowSnapshot).not.toHaveBeenCalled();
    expect(mocks.writeJournal.mock.calls.at(-1)?.[0]).toEqual([]);
    expect(service.hasSessionLease('recovered-session')).toBe(false);
  });
  it.each([720, 719])(
    'recovers interruption on either side of raster alignment (%i)',
    async (height) => {
      mocks.readJournal.mockResolvedValueOnce([
        journalEntry({
          phase: 'prepared',
          alignmentFrom: applied,
          applied: { ...applied, height: 719 },
        }),
      ]);
      mocks.getWindowSnapshot.mockResolvedValue({ ...applied, height });
      await new DefaultCaptureSurfaceService().recover();
      expect(mocks.restoreWindowSnapshot).toHaveBeenCalledWith(3, prior);
      expect(mocks.writeJournal.mock.calls.at(-1)?.[0]).toEqual([]);
    }
  );
  it('restores abandoned journal authority during startup recovery', async () => {
    mocks.readJournal.mockResolvedValueOnce([journalEntry()]);
    const beforeStack = vi.fn();
    const beforeLease = vi.fn();
    const service = new DefaultCaptureSurfaceService();

    await service.recover({
      beforeAbandonedRestore: beforeLease,
      beforeAbandonedStackRestore: beforeStack,
      liveSessionIds: new Set(),
    });

    expect(beforeStack).toHaveBeenCalledOnce();
    expect(beforeLease).toHaveBeenCalledWith(expect.objectContaining({ target: 'window' }));
    expect(mocks.restoreWindowSnapshot).toHaveBeenCalledWith(3, prior);
    expect(service.hasSessionLease('recovered-session')).toBe(false);
  });

  it('keeps live recovered authority and detects native bounds conflicts', async () => {
    mocks.readJournal.mockResolvedValueOnce([journalEntry()]);
    let onBoundsChanged: ((window: { id?: number }) => void) | undefined;
    mocks.subscribeBoundsChanged.mockImplementationOnce(
      (listener?: (window: { id?: number }) => void) => {
        onBoundsChanged = listener;
        return vi.fn();
      }
    );
    const service = new DefaultCaptureSurfaceService();
    await service.recover({ liveSessionIds: new Set(['recovered-session']) });
    expect(service.getAppliedBindingForSession('recovered-session')).toMatchObject({ tabId: 7 });

    mocks.getWindowSnapshot.mockResolvedValueOnce({ ...applied, top: 1 });
    onBoundsChanged?.({ id: 3 });
    await vi.waitFor(() =>
      expect(mocks.writeJournal.mock.calls.at(-1)?.[0]?.[0]).toMatchObject({ phase: 'conflict' })
    );
  });
});

describe('window-only active lease lifecycle', () => {
  it('accepts an unchanged window on reassert and marks a changed window conflicted', async () => {
    const service = new DefaultCaptureSurfaceService();
    const binding = await service.apply(request());
    await expect(service.reassert(binding)).resolves.toBeUndefined();

    mocks.getWindowSnapshot.mockResolvedValueOnce({ ...applied, height: 719 });
    await expect(service.reassert(binding)).rejects.toMatchObject({ code: 'restore-conflict' });
    await expect(service.abandonConflicted(binding)).resolves.toBeUndefined();
    expect(service.getApplied(7)).toBeNull();
  });

  it('rejects stale release and reassert identities', async () => {
    const service = new DefaultCaptureSurfaceService();
    const binding = await service.apply(request());
    const stale = { ...binding, generation: binding.generation + 1 };

    await expect(service.reassert(stale)).rejects.toMatchObject({ code: 'stale-generation' });
    await expect(service.release(stale)).rejects.toMatchObject({ code: 'stale-generation' });
    await expect(service.abandonConflicted(binding)).rejects.toMatchObject({
      code: 'stale-generation',
    });
  });

  it('cleans an owned lease for a closed tab and refuses to cross another owner', async () => {
    const service = new DefaultCaptureSurfaceService();
    await service.apply(request());
    await service.terminateClosedTab(7, ['screenshot']);
    expect(service.getApplied(7)).toBeNull();

    const other = new DefaultCaptureSurfaceService();
    await other.apply(request());
    await expect(other.terminateClosedTab(7, ['video'])).resolves.toBeUndefined();
    expect(other.getApplied(7)).not.toBeNull();
  });

  it('forgets a closed tab lease without changing manually adjusted window bounds', async () => {
    const service = new DefaultCaptureSurfaceService();
    await service.apply(request());
    mocks.getWindowSnapshot.mockResolvedValueOnce({ ...applied, left: applied.left + 1 });

    await expect(service.terminateClosedTab(7, ['screenshot'])).resolves.toBeUndefined();
    expect(mocks.restoreWindowSnapshot).not.toHaveBeenCalled();
    expect(service.hasOwnerLease('screenshot')).toBe(false);
    expect(mocks.writeJournal.mock.calls.at(-1)?.[0]).toEqual([]);
  });

  it('clears conflicted owners during global cleanup without restoring moved windows', async () => {
    const service = new DefaultCaptureSurfaceService();
    await service.apply(request());
    mocks.getWindowSnapshot.mockResolvedValue({ ...applied, left: applied.left + 1 });

    await expect(service.releaseOwners(['screenshot'])).resolves.toBeUndefined();
    expect(mocks.restoreWindowSnapshot).not.toHaveBeenCalled();
    expect(service.hasOwnerLease('screenshot')).toBe(false);
  });

  it('preserves an already-restored window without applying a second restore', async () => {
    const service = new DefaultCaptureSurfaceService();
    const binding = await service.apply(request());
    mocks.getWindowSnapshot.mockResolvedValueOnce(prior);
    mocks.restoreWindowSnapshot.mockClear();

    await service.release(binding);
    expect(mocks.restoreWindowSnapshot).not.toHaveBeenCalled();
  });

  it('surfaces typed preparation failures without staging journal authority', async () => {
    mocks.prepareWindowSize.mockRejectedValueOnce(new CaptureSurfaceError('window-too-large'));
    const service = new DefaultCaptureSurfaceService();

    await expect(service.apply(request())).rejects.toMatchObject({ code: 'window-too-large' });
    expect(mocks.writeJournal).not.toHaveBeenCalled();
  });

  it('rejects a nested lease when the native window no longer matches its parent', async () => {
    const service = new DefaultCaptureSurfaceService();
    await service.apply(request());
    mocks.prepareWindowSize.mockResolvedValueOnce({
      expected: applied,
      prior: { ...applied, width: applied.width - 1 },
    });

    await expect(
      service.apply(request({ generation: 1, owner: 'quick-action', sessionId: 'quick-1' }))
    ).rejects.toMatchObject({ code: 'restore-conflict' });
  });

  it('releases all matching owners with their exact window identity', async () => {
    const beforeRelease = vi.fn();
    const service = new DefaultCaptureSurfaceService();
    await service.apply(request());

    await service.releaseOwners(['screenshot'], { beforeRelease });

    expect(beforeRelease).toHaveBeenCalledWith({
      generation: 1,
      owner: 'screenshot',
      sessionId: 'session-1',
      tabId: 7,
      target: 'window',
    });
    expect(service.hasOwnerLease('screenshot')).toBe(false);
  });

  it('removes a suspended tab owner while retaining its active child', async () => {
    const service = new DefaultCaptureSurfaceService();
    await service.apply(request());
    mocks.prepareWindowSize.mockResolvedValueOnce({ expected: applied, prior: applied });
    const child = await service.apply(
      request({ generation: 1, owner: 'quick-action', sessionId: 'quick-1' })
    );

    await service.releaseTabOwners(7, ['screenshot']);

    expect(service.getApplied(7)).toEqual(child);
    expect(service.hasOwnerLease('screenshot')).toBe(false);
  });
});
