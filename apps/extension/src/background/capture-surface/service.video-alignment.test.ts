import { beforeEach, describe, expect, it, vi } from 'vitest';

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

describe('window-only video alignment application', () => {
  it('aligns measured tab pixels, journals both native sizes, and restores the original window', async () => {
    let current = applied;
    const snapshots: unknown[] = [];
    mocks.writeJournal.mockImplementation(async (entries) => {
      snapshots.push(structuredClone(entries));
    });
    mocks.getWindowSnapshot.mockImplementation(async () => current);
    mocks.getWindowWorkArea.mockImplementation(async () => ({
      snapshot: current,
      workArea: { width: 1920, height: 1040 },
    }));
    mocks.applyPreparedWindowSize.mockImplementation(async (_id, _prior, next) => {
      current = next;
      return next;
    });
    const measure = vi.fn(async () => ({
      width: current.width,
      height: current.height - 87,
      scale: 1,
      windowId: 3,
    }));
    const service = new DefaultCaptureSurfaceService();
    const binding = await service.apply(
      request({ owner: 'video', context: 'video-tab', measureVideoViewport: measure })
    );
    expect(binding.height).toBe(719);
    expect(snapshots).toContainEqual([
      expect.objectContaining({
        phase: 'prepared',
        alignmentFrom: applied,
        applied: { ...applied, height: 719 },
        prior,
      }),
    ]);
    expect(snapshots.at(-1)).toEqual([
      expect.not.objectContaining({ alignmentFrom: expect.anything() }),
    ]);
    await service.release(binding);
    expect(mocks.restoreWindowSnapshot).toHaveBeenCalledWith(3, prior);
  });

  it('journals Chrome-adjusted coordinates after video raster alignment', async () => {
    let current = applied;
    const adjusted = { ...applied, height: 719, left: applied.left + 8 };
    mocks.getWindowSnapshot.mockImplementation(async () => current);
    mocks.getWindowWorkArea.mockImplementation(async () => ({
      snapshot: current,
      workArea: { width: 1920, height: 1040 },
    }));
    mocks.applyPreparedWindowSize.mockImplementation(async (_id, _prior, next) => {
      current = next.height === 719 ? adjusted : next;
      return current;
    });
    const measure = vi.fn(async () => ({ width: 1280, height: 633, scale: 1, windowId: 3 }));
    const service = new DefaultCaptureSurfaceService();

    const binding = await service.apply(
      request({ owner: 'video', context: 'video-tab', measureVideoViewport: measure })
    );
    expect(mocks.writeJournal.mock.calls.at(-1)?.[0]?.[0]?.applied).toEqual(adjusted);
    await service.release(binding);
    expect(mocks.restoreWindowSnapshot).toHaveBeenCalledWith(3, prior);
  });

  it('keeps an owned Full HD window when Chromium ignores the optional raster correction', async () => {
    const fullHd = { ...preset, height: 1080, id: 'window-full-hd', width: 1920 };
    const fullHdWindow = { ...prior, height: 1080, width: 1920 };
    mocks.loadSettings.mockResolvedValue({ viewportPresets: [fullHd] });
    mocks.prepareWindowSize.mockResolvedValue({ expected: fullHdWindow, prior });
    let current = fullHdWindow;
    mocks.getWindowSnapshot.mockImplementation(async () => current);
    mocks.getWindowWorkArea.mockImplementation(async () => ({
      snapshot: current,
      workArea: { width: 2560, height: 1440 },
    }));
    mocks.applyPreparedWindowSize.mockImplementation(async (_id, _prior, next) => {
      current = next;
      return next;
    });
    const measure = vi.fn(async () => ({ width: 1920, height: 993, scale: 1, windowId: 3 }));
    const service = new DefaultCaptureSurfaceService();
    const binding = await service.apply(
      request({
        owner: 'video',
        context: 'video-tab',
        measureVideoViewport: measure,
        presetId: fullHd.id,
      })
    );
    expect(binding).toMatchObject({ width: 1920, height: 1079 });
    expect(current).toMatchObject({ width: 1920, height: 1079 });
    await service.release(binding);
    expect(mocks.restoreWindowSnapshot).toHaveBeenCalledWith(3, prior);
  });

  it('does not mutate again if the alignment journal cannot be written', async () => {
    mocks.getWindowWorkArea.mockResolvedValue({
      snapshot: applied,
      workArea: { width: 1920, height: 1040 },
    });
    mocks.writeJournal
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('storage failed'));
    const measure = vi.fn(async () => ({ width: 1280, height: 633, scale: 1, windowId: 3 }));
    await expect(
      new DefaultCaptureSurfaceService().apply(
        request({ owner: 'video', context: 'video-tab', measureVideoViewport: measure })
      )
    ).rejects.toThrow('storage failed');
    expect(mocks.applyPreparedWindowSize).toHaveBeenCalledOnce();
    expect(mocks.restoreWindowSnapshot).toHaveBeenCalledWith(3, prior);
  });

  it('rejects alignment for screenshot consumers before mutation', async () => {
    await expect(
      new DefaultCaptureSurfaceService().apply(request({ measureVideoViewport: vi.fn() }))
    ).rejects.toMatchObject({ code: 'unsupported-context' });
    expect(mocks.applyPreparedWindowSize).not.toHaveBeenCalled();
  });
});
