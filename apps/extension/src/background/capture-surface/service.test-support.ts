import { beforeEach, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  acknowledgeClosedViewportTab: vi.fn(),
  applyPreparedWindowSize: vi.fn(),
  currentViewport: vi.fn(),
  getTab: vi.fn(),
  getTabZoom: vi.fn(),
  getWindowSnapshot: vi.fn(),
  getWindowWorkArea: vi.fn(),
  loadSettings: vi.fn(),
  prepareViewportSurface: vi.fn(),
  prepareWindowSize: vi.fn(),
  readJournal: vi.fn(),
  readViewportCapacity: vi.fn(),
  releaseViewportSurfaceAcquisition: vi.fn(),
  restoreViewportSnapshot: vi.fn(),
  restoreWindowSnapshot: vi.fn(),
  setViewportSurface: vi.fn(),
  subscribeBoundsChanged: vi.fn((_listener: (window: { id?: number }) => void) => vi.fn()),
  writeJournal: vi.fn(),
}));

export function getCaptureSurfaceServiceTestMocks() {
  return mocks;
}

vi.mock('@sniptale/platform/browser/tabs', () => ({
  browserTabs: { get: mocks.getTab },
}));

vi.mock('@sniptale/platform/browser/windows', () => ({
  browserWindows: { subscribeBoundsChanged: mocks.subscribeBoundsChanged },
}));

vi.mock('../../composition/persistence/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../composition/persistence/settings')>()),
  loadSettings: mocks.loadSettings,
}));

vi.mock('./viewport-capacity', () => ({
  readViewportCapacity: mocks.readViewportCapacity,
}));

vi.mock('../storage/capture-surface', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../storage/capture-surface')>()),
  readCaptureSurfaceJournal: mocks.readJournal,
  writeCaptureSurfaceJournal: mocks.writeJournal,
}));

vi.mock('./viewport', () => ({
  acknowledgeClosedViewportTab: mocks.acknowledgeClosedViewportTab,
  getCurrentViewportSize: mocks.currentViewport,
  getTabZoom: mocks.getTabZoom,
  prepareViewportSurface: mocks.prepareViewportSurface,
  releaseViewportSurfaceAcquisition: mocks.releaseViewportSurfaceAcquisition,
  restoreViewportSnapshot: mocks.restoreViewportSnapshot,
  setViewportSurface: mocks.setViewportSurface,
  viewportSnapshotMatches: (
    left: { width: number; height: number },
    right: { width: number; height: number }
  ) => left.width === right.width && left.height === right.height,
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

const serviceModule = await import('./service');

export const DefaultCaptureSurfaceService = serviceModule.DefaultCaptureSurfaceService;

export const journalSnapshots: unknown[][] = [];

export const viewportPreset = {
  kind: 'user' as const,
  id: 'viewport-1',
  name: 'Viewport',
  target: 'viewport' as const,
  width: 1280,
  height: 720,
  enabled: true,
  order: 0,
};

export const compactViewportPreset = {
  ...viewportPreset,
  id: 'viewport-2',
  name: 'Compact viewport',
  width: 1024,
  height: 640,
  order: 1,
};

export const windowPreset = {
  ...viewportPreset,
  id: 'window-1',
  name: 'Window',
  target: 'window' as const,
};

export const priorWindow = {
  type: 'window' as const,
  left: -1500,
  top: 20,
  width: 1440,
  height: 900,
  state: 'normal' as const,
};

export const appliedWindow = {
  ...priorWindow,
  width: 1280,
  height: 720,
};

export function request(overrides: Record<string, unknown> = {}) {
  return {
    sessionId: 'session-1',
    generation: 1,
    owner: 'screenshot' as const,
    tabId: 7,
    presetId: viewportPreset.id,
    context: 'screenshot' as const,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  let lease = 0;
  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => `lease-${++lease}`) });
  mocks.readJournal.mockResolvedValue([]);
  journalSnapshots.length = 0;
  mocks.writeJournal.mockImplementation(async (entries: unknown[]) => {
    journalSnapshots.push(structuredClone(entries));
  });
  mocks.loadSettings.mockResolvedValue({
    viewportPresets: [viewportPreset, compactViewportPreset, windowPreset],
  });
  mocks.getTab.mockResolvedValue({ id: 7, windowId: 3 });
  mocks.getTabZoom.mockResolvedValue(1);
  mocks.readViewportCapacity.mockResolvedValue({ width: 1440, height: 900 });
  let viewportSize = { width: 1440, height: 900 };
  mocks.prepareViewportSurface.mockImplementation(async () => ({
    acquired: true,
    current: { ...viewportSize },
    releaseAcquisition: vi.fn().mockResolvedValue(undefined),
  }));
  mocks.releaseViewportSurfaceAcquisition.mockResolvedValue(undefined);
  mocks.currentViewport.mockImplementation(async () => ({ ...viewportSize }));
  mocks.setViewportSurface.mockImplementation(
    async ({ width, height }: { width: number; height: number }) => {
      viewportSize = { width, height };
    }
  );
  mocks.restoreViewportSnapshot.mockImplementation(
    async ({ snapshot }: { snapshot: { width: number; height: number } }) => {
      viewportSize = { width: snapshot.width, height: snapshot.height };
    }
  );
  mocks.getWindowWorkArea.mockResolvedValue({
    snapshot: priorWindow,
    workArea: { left: -1920, top: 0, width: 1920, height: 1040 },
  });
  mocks.prepareWindowSize.mockResolvedValue({ prior: priorWindow, expected: appliedWindow });
  mocks.applyPreparedWindowSize.mockResolvedValue(appliedWindow);
  mocks.getWindowSnapshot.mockResolvedValue(appliedWindow);
  mocks.restoreWindowSnapshot.mockResolvedValue(undefined);
});
