import { beforeEach, expect, it, vi } from 'vitest';
import { TabRuntimeCapability } from '@sniptale/runtime-contracts/tab-capabilities/types';

const mocks = vi.hoisted(() => ({
  apply: vi.fn(),
  authorize: vi.fn(),
  claimApply: vi.fn(),
  claimRelease: vi.fn(),
  classify: vi.fn(),
  getApplied: vi.fn(),
  getAvailabilities: vi.fn(),
  getSession: vi.fn(),
  getTab: vi.fn(),
  loadSettings: vi.fn(),
  markApplied: vi.fn(),
  markReleased: vi.fn(),
  nextGeneration: vi.fn(),
  release: vi.fn(),
  replace: vi.fn(),
  runOperation: vi.fn(async (_tabId: number, operation: () => Promise<void>) => operation()),
  sendTabMessage: vi.fn(),
  sendViewerPreparationCommand: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/tabs', () => ({ browserTabs: { get: mocks.getTab } }));
vi.mock('../../../composition/persistence/settings', () => ({ loadSettings: mocks.loadSettings }));
vi.mock('../../../features/tab-capabilities/runtime', () => ({
  classifyTabRuntimeCapability: mocks.classify,
}));
vi.mock('../../capture-surface', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../capture-surface')>()),
  getCaptureSurfaceService: () => ({
    apply: mocks.apply,
    getApplied: mocks.getApplied,
    getAvailabilities: mocks.getAvailabilities,
    replace: mocks.replace,
    release: mocks.release,
  }),
}));
vi.mock('../../capture-surface/screenshot-session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../capture-surface/screenshot-session')>()),
  authorizeScreenshotSurfaceMutation: mocks.authorize,
  claimScreenshotSurfaceApply: mocks.claimApply,
  claimScreenshotSurfaceRelease: mocks.claimRelease,
  getScreenshotSurfaceSession: mocks.getSession,
  markScreenshotSurfaceApplied: mocks.markApplied,
  markScreenshotSurfaceReleased: mocks.markReleased,
  nextScreenshotSurfaceGeneration: mocks.nextGeneration,
}));
vi.mock('../../routing-contracts/runtime-messaging/services', () => ({
  getBackgroundRuntimeMessaging: () => ({ sendTabMessage: mocks.sendTabMessage }),
}));
vi.mock('../../capture/lifecycle', () => ({
  sendViewerPreparationCommand: mocks.sendViewerPreparationCommand,
}));
vi.mock('./operation-queue', () => ({ runScreenshotModeOperation: mocks.runOperation }));

import {
  getScreenshotPresetAvailabilities,
  handleApplyViewportPreset,
  handleReleaseViewportPreset,
} from './viewport';

const viewportPreset = {
  enabled: true,
  height: 720,
  id: 'viewport-1',
  kind: 'user' as const,
  name: 'HD viewport',
  order: 0,
  target: 'viewport' as const,
  width: 1280,
};
const windowPreset = { ...viewportPreset, id: 'window-1', target: 'window' as const };

function stateMaps() {
  return {
    viewportOwnerState: new Map<number, 'capture-surface' | 'viewer'>(),
    viewportState: new Map<
      number,
      { presetId: string; target: 'viewport' | 'window'; width: number; height: number } | null
    >(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authorize.mockReturnValue(true);
  mocks.claimApply.mockReturnValue({ generation: 2, sessionId: 'screenshot-session-1' });
  mocks.claimRelease.mockReturnValue({ generation: 2, sessionId: 'screenshot-session-1' });
  mocks.classify.mockReturnValue(TabRuntimeCapability.Regular);
  mocks.getTab.mockResolvedValue({ id: 7, url: 'https://example.com' });
  mocks.loadSettings.mockResolvedValue({ viewportPresets: [viewportPreset, windowPreset] });
  mocks.nextGeneration.mockReturnValue({ generation: 2, sessionId: 'screenshot-session-1' });
  mocks.apply.mockResolvedValue({
    generation: 2,
    height: 720,
    leaseId: 'lease-2',
    presetId: 'viewport-1',
    sessionId: 'screenshot-session-1',
    target: 'viewport',
    width: 1280,
  });
  mocks.release.mockResolvedValue(undefined);
  mocks.replace.mockResolvedValue({
    generation: 2,
    height: 720,
    leaseId: 'lease-2',
    presetId: 'viewport-1',
    sessionId: 'screenshot-session-1',
    target: 'viewport',
    width: 1280,
  });
  mocks.sendTabMessage.mockResolvedValue(undefined);
  mocks.sendViewerPreparationCommand.mockResolvedValue(undefined);
  mocks.getAvailabilities.mockResolvedValue([
    {
      status: 'available',
      presetId: 'viewport-1',
      required: { height: 720, width: 1280 },
      target: 'viewport',
    },
  ]);
});

it('applies an authorized regular preset by ID and notifies content after exact application', async () => {
  const maps = stateMaps();
  await handleApplyViewportPreset(
    7,
    'viewport-1',
    2,
    'capability-1',
    'document-1',
    maps.viewportState,
    maps.viewportOwnerState
  );

  expect(mocks.apply).toHaveBeenCalledWith({
    context: 'screenshot',
    generation: 2,
    owner: 'screenshot',
    presetId: 'viewport-1',
    sessionId: 'screenshot-session-1',
    tabId: 7,
  });
  expect(maps.viewportOwnerState.get(7)).toBe('capture-surface');
  expect(maps.viewportState.get(7)).toMatchObject({ presetId: 'viewport-1' });
  expect(mocks.sendTabMessage).toHaveBeenCalledWith(
    7,
    expect.objectContaining({ type: 'VIEWPORT_CHANGED' })
  );
});

it('replaces a previous matching surface transactionally', async () => {
  mocks.getSession.mockReturnValue({ sessionId: 'screenshot-session-1' });
  mocks.getApplied.mockReturnValue({
    generation: 1,
    height: 720,
    leaseId: 'lease-1',
    presetId: 'viewport-1',
    sessionId: 'screenshot-session-1',
    target: 'viewport',
    width: 1280,
  });
  const maps = stateMaps();

  await handleApplyViewportPreset(
    7,
    'viewport-1',
    2,
    'capability-1',
    'document-1',
    maps.viewportState,
    maps.viewportOwnerState
  );

  expect(mocks.replace).toHaveBeenCalledWith(
    expect.objectContaining({ generation: 2, presetId: 'viewport-1' })
  );
  expect(mocks.release).not.toHaveBeenCalled();
});

it.each([
  ['viewport', 'window-1', 'window'],
  ['window', 'viewport-1', 'viewport'],
] as const)(
  'transactionally switches from %s to the opposite target',
  async (currentTarget, nextPresetId, nextTarget) => {
    const currentPresetId = currentTarget === 'viewport' ? 'viewport-1' : 'window-1';
    const current = {
      generation: 1,
      height: 720,
      leaseId: 'lease-1',
      presetId: currentPresetId,
      sessionId: 'screenshot-session-1',
      target: currentTarget,
      width: 1280,
    };
    mocks.getApplied.mockReturnValue(current);
    mocks.replace.mockResolvedValueOnce({
      ...current,
      generation: 2,
      leaseId: 'lease-2',
      presetId: nextPresetId,
      target: nextTarget,
    });
    const maps = stateMaps();

    await handleApplyViewportPreset(
      7,
      nextPresetId,
      2,
      'capability-1',
      'document-1',
      maps.viewportState,
      maps.viewportOwnerState
    );

    expect(mocks.replace).toHaveBeenCalledWith(
      expect.objectContaining({ generation: 2, presetId: nextPresetId })
    );
    expect(mocks.release).not.toHaveBeenCalled();
    expect(mocks.apply).not.toHaveBeenCalled();
    expect(maps.viewportState.get(7)).toMatchObject({ target: nextTarget });
  }
);

it('leaves cross-target rollback to the atomic capture-surface owner', async () => {
  const current = {
    generation: 1,
    height: 720,
    leaseId: 'lease-1',
    presetId: 'viewport-1',
    sessionId: 'screenshot-session-1',
    target: 'viewport' as const,
    width: 1280,
  };
  mocks.getApplied.mockReturnValue(current);
  mocks.nextGeneration.mockReturnValueOnce({
    generation: 2,
    sessionId: 'screenshot-session-1',
  });
  mocks.replace.mockRejectedValueOnce(new Error('window mutation failed'));
  mocks.getApplied.mockReturnValueOnce(current).mockReturnValueOnce(null);
  const maps = stateMaps();
  maps.viewportOwnerState.set(7, 'capture-surface');
  maps.viewportState.set(7, {
    presetId: 'viewport-1',
    target: 'viewport',
    width: 1280,
    height: 720,
  });

  await expect(
    handleApplyViewportPreset(
      7,
      'window-1',
      2,
      'capability-1',
      'document-1',
      maps.viewportState,
      maps.viewportOwnerState
    )
  ).rejects.toThrow('window mutation failed');

  expect(mocks.replace).toHaveBeenCalledWith(
    expect.objectContaining({ generation: 2, presetId: 'window-1' })
  );
  expect(mocks.apply).not.toHaveBeenCalled();
  expect(mocks.release).not.toHaveBeenCalled();
  expect(maps.viewportOwnerState.has(7)).toBe(false);
  expect(maps.viewportState.get(7)).toBeNull();
  expect(mocks.sendTabMessage).toHaveBeenCalledWith(7, {
    type: 'VIEWPORT_CHANGED',
    viewport: null,
  });
});

it('rejects unauthorized and restricted mutations before privileged effects', async () => {
  const maps = stateMaps();
  mocks.authorize.mockReturnValueOnce(false);
  await expect(
    handleApplyViewportPreset(
      7,
      'viewport-1',
      2,
      'bad-token',
      'document-1',
      maps.viewportState,
      maps.viewportOwnerState
    )
  ).rejects.toThrow('authorization-expired');

  mocks.classify.mockReturnValueOnce(TabRuntimeCapability.Restricted);
  await expect(
    handleApplyViewportPreset(
      7,
      'viewport-1',
      2,
      'capability-1',
      'document-1',
      maps.viewportState,
      maps.viewportOwnerState
    )
  ).rejects.toThrow('unsupported-context');
  expect(mocks.apply).not.toHaveBeenCalled();
});

it('rejects stale apply and release identities before privileged effects', async () => {
  const maps = stateMaps();
  mocks.claimApply.mockReturnValueOnce(null);

  await expect(
    handleApplyViewportPreset(
      7,
      'viewport-1',
      1,
      'capability-1',
      'document-1',
      maps.viewportState,
      maps.viewportOwnerState
    )
  ).rejects.toThrow('stale-generation');

  mocks.claimRelease.mockReturnValueOnce(null);
  await expect(
    handleReleaseViewportPreset(
      7,
      2,
      1,
      'capability-1',
      'document-1',
      maps.viewportState,
      maps.viewportOwnerState
    )
  ).rejects.toThrow('stale-generation');

  expect(mocks.apply).not.toHaveBeenCalled();
  expect(mocks.replace).not.toHaveBeenCalled();
  expect(mocks.release).not.toHaveBeenCalled();
});

it('resizes an owned viewer locally and keeps browser-window presets disabled', async () => {
  mocks.classify.mockReturnValue(TabRuntimeCapability.OwnedSnapshotViewer);
  const maps = stateMaps();
  const ports = new Map();

  await handleApplyViewportPreset(
    7,
    'viewport-1',
    2,
    'capability-1',
    'document-1',
    maps.viewportState,
    maps.viewportOwnerState,
    ports
  );
  expect(mocks.sendViewerPreparationCommand).toHaveBeenCalledWith(
    ports,
    7,
    expect.objectContaining({
      type: 'PREPARATION_SURFACE_RESIZE',
      viewport: expect.objectContaining({ presetId: 'viewport-1', target: 'viewport' }),
    })
  );
  expect(maps.viewportOwnerState.get(7)).toBe('viewer');
  expect(mocks.sendTabMessage).not.toHaveBeenCalled();

  await expect(
    handleApplyViewportPreset(
      7,
      'window-1',
      3,
      'capability-1',
      'document-1',
      maps.viewportState,
      maps.viewportOwnerState,
      ports
    )
  ).rejects.toThrow('unsupported-context');
});

it('releases regular and viewer surfaces and clears projected state', async () => {
  mocks.getSession.mockReturnValue({ sessionId: 'screenshot-session-1' });
  mocks.getApplied
    .mockReturnValueOnce({
      generation: 2,
      leaseId: 'lease-2',
      sessionId: 'screenshot-session-1',
    })
    .mockReturnValue(null);
  const regular = stateMaps();
  await handleReleaseViewportPreset(
    7,
    3,
    2,
    'capability-1',
    'document-1',
    regular.viewportState,
    regular.viewportOwnerState
  );
  expect(mocks.release).toHaveBeenCalledOnce();
  expect(mocks.sendTabMessage).toHaveBeenCalledWith(7, {
    type: 'VIEWPORT_CHANGED',
    viewport: null,
  });
  expect(regular.viewportState.get(7)).toBeNull();

  mocks.classify.mockReturnValue(TabRuntimeCapability.OwnedSnapshotViewer);
  const viewer = stateMaps();
  const ports = new Map();
  await handleReleaseViewportPreset(
    7,
    4,
    3,
    'capability-1',
    'document-1',
    viewer.viewportState,
    viewer.viewportOwnerState,
    ports
  );
  expect(mocks.sendViewerPreparationCommand).toHaveBeenLastCalledWith(ports, 7, {
    type: 'PREPARATION_SURFACE_RESIZE',
    viewport: null,
  });
});

it('rejects Current size while the screenshot lease is suspended beneath video', async () => {
  mocks.getSession.mockReturnValue({ sessionId: 'screenshot-session-1' });
  mocks.getApplied.mockReturnValue({
    generation: 1,
    leaseId: 'video-lease',
    sessionId: 'recording-1',
  });
  const maps = stateMaps();

  await expect(
    handleReleaseViewportPreset(
      7,
      2,
      1,
      'capability-1',
      'document-1',
      maps.viewportState,
      maps.viewportOwnerState
    )
  ).rejects.toMatchObject({ code: 'surface-busy' });

  expect(mocks.release).not.toHaveBeenCalled();
  expect(mocks.sendTabMessage).not.toHaveBeenCalled();
});

it('projects viewer, restricted, and regular availability in one batch without hidden fallback', async () => {
  mocks.classify.mockReturnValue(TabRuntimeCapability.OwnedSnapshotViewer);
  await expect(
    getScreenshotPresetAvailabilities(7, ['viewport-1', 'window-1', 'missing'])
  ).resolves.toEqual([
    expect.objectContaining({ status: 'available', target: 'viewport' }),
    expect.objectContaining({
      status: 'unavailable',
      reason: 'unsupported-context',
      target: 'window',
    }),
    expect.objectContaining({ status: 'unavailable', reason: 'missing' }),
  ]);
  mocks.loadSettings.mockResolvedValueOnce({
    viewportPresets: [{ ...viewportPreset, enabled: false }],
  });
  await expect(getScreenshotPresetAvailabilities(7, ['viewport-1'])).resolves.toEqual([
    expect.objectContaining({
      status: 'unavailable',
      reason: 'disabled',
      target: 'viewport',
    }),
  ]);

  mocks.classify.mockReturnValueOnce(TabRuntimeCapability.Restricted);
  await expect(getScreenshotPresetAvailabilities(7, ['viewport-1'])).resolves.toEqual([
    expect.objectContaining({ status: 'unavailable', reason: 'unsupported-context' }),
  ]);

  mocks.classify.mockReturnValueOnce(TabRuntimeCapability.Regular);
  await getScreenshotPresetAvailabilities(7, ['viewport-1', 'window-1'], 'video');
  expect(mocks.getAvailabilities).toHaveBeenCalledWith({
    context: 'video-tab',
    presetIds: ['viewport-1', 'window-1'],
    tabId: 7,
  });
});
