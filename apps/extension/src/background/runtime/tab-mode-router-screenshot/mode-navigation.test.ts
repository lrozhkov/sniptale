import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installBackgroundRuntimeMessagingMock } from '../../routing-contracts/runtime-messaging/mock';

const mocks = vi.hoisted(() => ({
  getApplied: vi.fn(),
  loggerWarn: vi.fn(),
  release: vi.fn(),
  releaseTabOwners: vi.fn(),
  sendTabMessage: vi.fn(),
  terminateClosedTab: vi.fn(),
}));

vi.mock('../../capture-surface', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../capture-surface')>()),
  getCaptureSurfaceService: () => ({
    getApplied: mocks.getApplied,
    release: mocks.release,
    releaseTabOwners: mocks.releaseTabOwners,
    terminateClosedTab: mocks.terminateClosedTab,
  }),
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), error: vi.fn(), log: vi.fn(), warn: mocks.loggerWarn }),
}));

import {
  beginScreenshotSurfaceSession,
  nextScreenshotSurfaceGeneration,
  resetScreenshotSurfaceSessionsForTests,
} from '../../capture-surface/screenshot-session';
import {
  cleanupScreenshotModeAfterNavigation,
  cleanupScreenshotModeAfterTabClose,
} from './navigation-cleanup';

beforeEach(() => {
  vi.clearAllMocks();
  resetScreenshotSurfaceSessionsForTests();
  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'session-1') });
  installBackgroundRuntimeMessagingMock({ sendTabMessage: mocks.sendTabMessage });
  mocks.sendTabMessage.mockResolvedValue(undefined);
  mocks.release.mockResolvedValue(undefined);
  mocks.releaseTabOwners.mockResolvedValue(undefined);
  mocks.terminateClosedTab.mockResolvedValue(undefined);
});

it('terminates closed-tab capture authority before deleting its projections', async () => {
  const screenshot = new Map([[5, true]]);
  const viewport = new Map([[5, null]]);
  const owner = new Map<number, 'capture-surface' | 'viewer'>([[5, 'capture-surface']]);

  await cleanupScreenshotModeAfterTabClose(5, screenshot, viewport, owner);

  expect(mocks.terminateClosedTab).toHaveBeenCalledWith(5, ['quick-action', 'screenshot']);
  expect(screenshot.has(5)).toBe(false);
  expect(viewport.has(5)).toBe(false);
  expect(owner.has(5)).toBe(false);
});

describe('screenshot navigation cleanup', () => {
  it('releases the matching surface lease and clears every session projection', async () => {
    const session = nextScreenshotSurfaceGeneration(5);
    mocks.getApplied
      .mockReturnValueOnce({
        sessionId: session.sessionId,
        leaseId: 'lease-1',
        generation: session.generation,
        presetId: 'wide',
        target: 'viewport',
        width: 1440,
        height: 900,
      })
      .mockReturnValueOnce(null);
    const screenshot = new Map([[5, true]]);
    const viewport = new Map([
      [5, { presetId: 'wide', target: 'viewport' as const, width: 1440, height: 900 }],
    ]);
    const owner = new Map<number, 'capture-surface' | 'viewer'>([[5, 'capture-surface']]);

    await cleanupScreenshotModeAfterNavigation(5, screenshot, viewport, owner);

    expect(mocks.sendTabMessage).toHaveBeenCalledWith(5, { type: 'DISABLE_SCREENSHOT_MODE' });
    expect(mocks.releaseTabOwners).toHaveBeenCalledWith(5, ['quick-action', 'screenshot']);
    expect(screenshot.has(5)).toBe(false);
    expect(viewport.has(5)).toBe(false);
    expect(owner.has(5)).toBe(false);
  });

  it('keeps owner projections retryable when surface restoration fails', async () => {
    const session = beginScreenshotSurfaceSession(5);
    mocks.getApplied.mockReturnValue({
      sessionId: session.sessionId,
      leaseId: 'lease-1',
      generation: 1,
    });
    mocks.sendTabMessage.mockRejectedValueOnce(new Error('content gone'));
    mocks.releaseTabOwners.mockRejectedValueOnce(new Error('restore conflict'));

    const screenshot = new Map([[5, true]]);
    const viewport = new Map([[5, null]]);
    const owner = new Map<number, 'capture-surface' | 'viewer'>([[5, 'capture-surface']]);
    await expect(
      cleanupScreenshotModeAfterNavigation(5, screenshot, viewport, owner)
    ).rejects.toThrow('restore conflict');

    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      'Failed to disable preparation after navigation',
      expect.any(Error)
    );
    expect(screenshot.get(5)).toBe(true);
    expect(owner.get(5)).toBe('capture-surface');
  });
});
