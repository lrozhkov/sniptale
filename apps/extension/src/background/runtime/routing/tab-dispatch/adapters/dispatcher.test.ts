import { beforeEach, expect, it, vi } from 'vitest';
import { createBackgroundRuntimeState } from '../../../../application/runtime-state';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import type { UnresolvedTabRouteArgs } from './types';

const mocks = vi.hoisted(() => ({
  capture: vi.fn(),
  missing: vi.fn(),
  normalize: vi.fn((message) => message),
  popupControl: vi.fn(),
  popupExport: vi.fn(),
  scenario: vi.fn(),
  surface: vi.fn(),
  tabMode: vi.fn(),
  videoControl: vi.fn(),
}));

vi.mock('../video-control', () => ({
  routePopupRecordingControlWithoutTabId: mocks.popupControl,
}));
vi.mock('./capture-adapter', () => ({ routeResolvedCaptureMessage: mocks.capture }));
vi.mock('./popup-export-adapter', () => ({ routeResolvedPopupExportMessage: mocks.popupExport }));
vi.mock('./scenario-adapter', () => ({ routeResolvedScenarioMessage: mocks.scenario }));
vi.mock('./tab-mode-adapter', () => ({ routeResolvedTabModeMessage: mocks.tabMode }));
vi.mock('./video-control-adapter', () => ({
  routeResolvedVideoControlMessage: mocks.videoControl,
}));
vi.mock('./video-recording-surface-adapter', () => ({
  routeResolvedVideoRecordingSurfaceMessage: mocks.surface,
}));
vi.mock('./tab-id', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./tab-id')>()),
  normalizeResolvedTabMessage: mocks.normalize,
  rejectMissingResolvedTabId: mocks.missing,
}));

import { routeAuthorizedTabAction } from './dispatcher';

function args(resolvedTabId: number | undefined = 7): UnresolvedTabRouteArgs {
  return {
    deps: createBackgroundRuntimeState(),
    logger: { error: vi.fn(), warn: vi.fn() },
    message: {
      type: VideoMessageType.PAUSE_RECORDING,
      recordingId: 'recording-1',
      controlToken: 'token-1',
    },
    resolvedTabId,
    sendResponse: vi.fn(),
    sender: undefined,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  [
    mocks.capture,
    mocks.popupExport,
    mocks.scenario,
    mocks.surface,
    mocks.tabMode,
    mocks.videoControl,
  ].forEach((mock) => mock.mockReturnValue(false));
});

it('short-circuits no-tab popup controls and missing resolved tabs', () => {
  mocks.popupControl.mockReturnValueOnce(true);
  routeAuthorizedTabAction(args(undefined));
  expect(mocks.missing).not.toHaveBeenCalled();
  mocks.missing.mockReturnValueOnce(true);
  routeAuthorizedTabAction(args(undefined));
  expect(mocks.normalize).not.toHaveBeenCalled();
});

it('routes through the surface adapter and rejects unknown resolved messages', () => {
  mocks.surface.mockReturnValueOnce(true);
  routeAuthorizedTabAction(args());
  expect(mocks.surface).toHaveBeenCalledOnce();
  const unknown = args();
  routeAuthorizedTabAction(unknown);
  expect(unknown.logger.warn).toHaveBeenCalledWith('Unhandled background tab message type', {
    type: VideoMessageType.PAUSE_RECORDING,
  });
  expect(unknown.sendResponse).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
});
