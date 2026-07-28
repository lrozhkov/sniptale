import { beforeEach, expect, it, vi } from 'vitest';
import { TabRuntimeCapability } from '@sniptale/runtime-contracts/tab-capabilities/types';
import type { Settings, UserViewportPreset, ViewportPreset } from '../../../../contracts/settings';
import type { QuickActionFlowArgs } from './shared';

const mocks = vi.hoisted(() => ({
  apply: vi.fn(),
  beginSession: vi.fn(),
  endSession: vi.fn(),
  getApplied: vi.fn(),
  getAvailability: vi.fn(),
  getSession: vi.fn(),
  loadSettings: vi.fn(),
  nextGeneration: vi.fn(),
  release: vi.fn(),
  releaseTabOwners: vi.fn(),
}));

vi.mock('../../../../composition/persistence/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../composition/persistence/settings')>()),
  loadSettings: mocks.loadSettings,
}));
vi.mock('../../../capture-surface', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../capture-surface')>()),
  getCaptureSurfaceService: () => ({
    apply: mocks.apply,
    getApplied: mocks.getApplied,
    getAvailability: mocks.getAvailability,
    release: mocks.release,
    releaseTabOwners: mocks.releaseTabOwners,
  }),
}));
vi.mock('../../../capture-surface/screenshot-session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../capture-surface/screenshot-session')>()),
  beginScreenshotSurfaceSession: mocks.beginSession,
  endScreenshotSurfaceSession: mocks.endSession,
  getScreenshotSurfaceSession: mocks.getSession,
  nextScreenshotSurfaceGeneration: mocks.nextGeneration,
}));

import {
  applyQuickActionSurface,
  releaseQuickActionSurface,
  releaseQuickActionSurfaceAfterFailure,
  resetQuickActionSurfaceTransactionsForTests,
} from './surface';

function createSettings(viewportPresets: ViewportPreset[]): Settings {
  return {
    authenticatedSnapshotAssetsEnabled: true,
    anonymousCrossOriginSnapshotAssetsEnabled: false,
    captureAction: 'download_default',
    contextMenu: {
      enabled: true,
      showExport: true,
      showGallery: true,
      showImageEditor: true,
      showPageLinkCopy: true,
      showScreenshots: true,
      showSettings: true,
      showVideo: true,
      showVideoEditor: true,
    },
    defaultViewportPresetId: null,
    imageFormat: 'png',
    imageQuality: 90,
    rawDiagnosticsEnabled: false,
    saveCapturesToGallery: false,
    skipWebSnapshotSaveDisclosure: false,
    viewportPresets,
  };
}

function createPreset(overrides: Partial<UserViewportPreset> = {}): UserViewportPreset {
  return {
    enabled: true,
    height: 720,
    id: 'preset-1',
    kind: 'user',
    name: 'HD viewport',
    order: 0,
    target: 'viewport',
    width: 1280,
    ...overrides,
  };
}

function createArgs(overrides: Partial<QuickActionFlowArgs> = {}): QuickActionFlowArgs {
  return {
    action: {
      exitAfterCapture: true,
      icon: 'camera',
      id: 'quick-action-1',
      name: 'Quick action',
      screenshotMode: 'visible',
      status: true,
    },
    afterCapture: 'download_default',
    delaySeconds: 0,
    imageFormat: 'png',
    imageQuality: 90,
    screenshotModeState: new Map(),
    settings: createSettings([]),
    tabId: 7,
    viewportPresetId: 'preset-1',
    viewportState: new Map(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  resetQuickActionSurfaceTransactionsForTests();
  mocks.getSession.mockReturnValue(null);
  mocks.beginSession.mockReturnValue({
    capabilityToken: 'capability-1',
    documentId: null,
    generation: 0,
    sessionId: 'session-1',
  });
  mocks.nextGeneration.mockReturnValue({
    capabilityToken: 'capability-1',
    documentId: null,
    generation: 1,
    sessionId: 'session-1',
  });
  mocks.loadSettings.mockResolvedValue({ viewportPresets: [createPreset()] });
  mocks.getAvailability.mockResolvedValue({ status: 'available' });
  mocks.apply.mockResolvedValue({
    generation: 1,
    height: 720,
    leaseId: 'lease-1',
    presetId: 'preset-1',
    sessionId: 'session-1',
    target: 'viewport',
    width: 1280,
  });
  mocks.release.mockResolvedValue(undefined);
  mocks.releaseTabOwners.mockResolvedValue(undefined);
});

it('keeps Current size native without resolving or applying a preset and returns its capability', async () => {
  const args = createArgs({ viewportPresetId: null });

  await expect(applyQuickActionSurface(args)).resolves.toEqual({
    surfaceCapabilityToken: 'capability-1',
  });

  expect(mocks.beginSession).toHaveBeenCalledWith(7);
  expect(args.viewportState.get(7)).toBeNull();
  expect(mocks.loadSettings).not.toHaveBeenCalled();
});

it('applies viewport presets locally in an owned snapshot viewer and rejects window presets', async () => {
  const args = createArgs({ pageCapability: TabRuntimeCapability.OwnedSnapshotViewer });
  await applyQuickActionSurface(args);
  expect(args.viewportState.get(7)).toEqual({
    height: 720,
    presetId: 'preset-1',
    target: 'viewport',
    width: 1280,
  });
  expect(mocks.apply).not.toHaveBeenCalled();
  await releaseQuickActionSurface(7, args.viewportState);

  mocks.loadSettings.mockResolvedValueOnce({
    viewportPresets: [createPreset({ target: 'window' })],
  });
  await expect(applyQuickActionSurface(args)).rejects.toThrow('unsupported-context');
});

it('fails explicitly for missing, disabled, and runtime-unavailable presets', async () => {
  const args = createArgs();
  mocks.loadSettings.mockResolvedValueOnce({ viewportPresets: [] });
  await expect(applyQuickActionSurface(args)).rejects.toThrow('missing');

  mocks.loadSettings.mockResolvedValueOnce({
    viewportPresets: [createPreset({ enabled: false })],
  });
  await expect(applyQuickActionSurface(args)).rejects.toThrow('disabled');

  mocks.getAvailability.mockResolvedValueOnce({
    status: 'unavailable',
    reason: 'viewport-too-large',
  });
  await expect(applyQuickActionSurface(args)).rejects.toThrow('viewport-too-large');
});

it('rechecks availability, applies by preset identity, and releases the matching session', async () => {
  const args = createArgs();
  await applyQuickActionSurface(args);

  expect(mocks.getAvailability).toHaveBeenCalledWith({
    context: 'quick-action',
    presetId: 'preset-1',
    tabId: 7,
  });
  expect(mocks.apply).toHaveBeenCalledWith({
    context: 'quick-action',
    generation: 1,
    owner: 'quick-action',
    presetId: 'preset-1',
    sessionId: 'session-1',
    tabId: 7,
  });

  mocks.getSession.mockReturnValue({ sessionId: 'session-1' });
  mocks.getApplied.mockReturnValue({
    generation: 1,
    leaseId: 'lease-1',
    sessionId: 'session-1',
  });
  await releaseQuickActionSurface(7, args.viewportState);

  expect(mocks.releaseTabOwners).toHaveBeenCalledWith(7, ['quick-action']);
  expect(mocks.endSession).toHaveBeenCalledWith(7);
  expect(args.viewportState.has(7)).toBe(false);
});

it('does nothing when no quick-action transaction exists', async () => {
  mocks.getSession.mockReturnValue({ sessionId: 'session-1' });
  mocks.getApplied.mockReturnValue({ sessionId: 'session-2' });

  await releaseQuickActionSurface(7);

  expect(mocks.releaseTabOwners).not.toHaveBeenCalled();
  expect(mocks.endSession).not.toHaveBeenCalled();
});

it('uses the already-current physical size for a native quick action without a second authority', async () => {
  const priorViewport = {
    height: 720,
    presetId: 'preset-a',
    target: 'viewport' as const,
    width: 1280,
  };
  const args = createArgs({ viewportPresetId: null });
  args.viewportState.set(7, priorViewport);
  mocks.getSession.mockReturnValue({
    capabilityToken: 'capability-1',
    generation: 1,
    sessionId: 'session-1',
  });
  mocks.beginSession.mockReturnValue({
    capabilityToken: 'capability-1',
    generation: 1,
    sessionId: 'session-1',
  });
  await applyQuickActionSurface(args);
  expect(mocks.releaseTabOwners).not.toHaveBeenCalled();
  expect(args.viewportState.get(7)).toEqual(priorViewport);

  await releaseQuickActionSurface(7, args.viewportState);
  expect(mocks.apply).not.toHaveBeenCalled();
  expect(args.viewportState.get(7)).toEqual(priorViewport);
  expect(mocks.endSession).not.toHaveBeenCalled();
});

it('nests preset B over A and releases only B so the surface owner restores A', async () => {
  const priorViewport = {
    height: 720,
    presetId: 'preset-a',
    target: 'viewport' as const,
    width: 1280,
  };
  const args = createArgs();
  args.viewportState.set(7, priorViewport);
  mocks.getSession.mockReturnValue({
    capabilityToken: 'capability-1',
    generation: 1,
    sessionId: 'session-1',
  });
  mocks.beginSession.mockReturnValue({
    capabilityToken: 'capability-1',
    generation: 1,
    sessionId: 'session-1',
  });
  mocks.apply.mockResolvedValueOnce({
    generation: 2,
    height: 720,
    leaseId: 'lease-b',
    presetId: 'preset-1',
    sessionId: 'session-1',
    target: 'viewport',
    width: 1280,
  });
  mocks.getApplied.mockReturnValue({
    generation: 2,
    leaseId: 'lease-b',
    presetId: 'preset-1',
    sessionId: 'session-1',
  });

  await applyQuickActionSurface(args);
  await releaseQuickActionSurface(7, args.viewportState);

  expect(mocks.releaseTabOwners).toHaveBeenCalledOnce();
  expect(mocks.releaseTabOwners).toHaveBeenCalledWith(7, ['quick-action']);
  expect(args.viewportState.get(7)).toEqual(priorViewport);
  expect(mocks.endSession).not.toHaveBeenCalled();
});

it('clears the transaction after normal completion so another quick action can start', async () => {
  const args = createArgs();
  const session = {
    capabilityToken: 'capability-1',
    documentId: null,
    generation: 1,
    sessionId: 'session-1',
  };
  mocks.getSession.mockReturnValue(session);
  mocks.beginSession.mockReturnValue(session);
  mocks.getApplied
    .mockReturnValueOnce(null)
    .mockReturnValueOnce({
      generation: 1,
      leaseId: 'lease-1',
      sessionId: 'session-1',
    })
    .mockReturnValueOnce(null)
    .mockReturnValueOnce({
      generation: 1,
      leaseId: 'lease-2',
      sessionId: 'session-1',
    });

  await applyQuickActionSurface(args);
  await releaseQuickActionSurface(7, args.viewportState);
  await expect(applyQuickActionSurface(args)).resolves.toEqual({
    surfaceCapabilityToken: 'capability-1',
  });
  await releaseQuickActionSurface(7, args.viewportState);

  expect(mocks.apply).toHaveBeenCalledTimes(2);
});

it('retains the transaction for retry when privileged surface rollback fails', async () => {
  const args = createArgs();
  await applyQuickActionSurface(args);
  mocks.releaseTabOwners.mockRejectedValueOnce(new Error('restore failed'));

  await expect(releaseQuickActionSurface(7, args.viewportState)).rejects.toThrow('restore failed');
  await expect(applyQuickActionSurface(args)).rejects.toThrow('surface-busy');

  await expect(releaseQuickActionSurface(7, args.viewportState)).resolves.toBeUndefined();
  await expect(applyQuickActionSurface(args)).resolves.toEqual({
    surfaceCapabilityToken: 'capability-1',
  });
});

it('preserves both the operation and rollback errors', async () => {
  const args = createArgs();
  await applyQuickActionSurface(args);
  mocks.releaseTabOwners.mockRejectedValueOnce(new Error('restore failed'));
  const operationError = new Error('content delivery failed');

  const error = await releaseQuickActionSurfaceAfterFailure(
    7,
    args.viewportState,
    operationError
  ).catch((cause: unknown) => cause);

  expect(error).toBeInstanceOf(AggregateError);
  expect((error as AggregateError).errors).toEqual([
    operationError,
    expect.objectContaining({ message: 'restore failed' }),
  ]);
  await expect(releaseQuickActionSurface(7, args.viewportState)).resolves.toBeUndefined();
});
