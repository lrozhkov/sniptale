import { describe, expect, it, vi } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';

const { createLogger } = vi.hoisted(() => ({
  createLogger: vi.fn(),
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger,
}));

import { createRegionOverlayBridgeDeps, handleRegionOverlayMessage } from './region-overlay';

function createRegion() {
  return {
    height: 180,
    width: 320,
    x: 12,
    y: 24,
  };
}

function createRegionSelectionBinding() {
  return {
    regionSelectionCapabilityToken: 'token-1',
    regionSelectionRequestGeneration: 'generation-1',
    regionSelectionRequestId: 'request-1',
  };
}

function createOverlayDeps() {
  return {
    hideRecordingOverlay: vi.fn(),
    hideRegionSelector: vi.fn(),
    logger: { debug: vi.fn() },
    showRecordingOverlay: vi.fn(),
    showRegionSelector: vi.fn(),
  };
}

function expectSelectorVisibilityRouting() {
  const deps = createOverlayDeps();
  const sendResponse = vi.fn();

  expect(
    handleRegionOverlayMessage(
      { type: VideoMessageType.SHOW_REGION_SELECTOR, ...createRegionSelectionBinding() },
      sendResponse,
      deps
    )
  ).toBe(true);
  expect(deps.showRegionSelector).toHaveBeenCalledWith(createRegionSelectionBinding());
  expect(sendResponse).toHaveBeenLastCalledWith({ success: true });

  expect(
    handleRegionOverlayMessage({ type: VideoMessageType.HIDE_REGION_SELECTOR }, sendResponse, deps)
  ).toBe(true);
  expect(deps.hideRegionSelector).toHaveBeenCalledOnce();
  expect(sendResponse).toHaveBeenLastCalledWith({ success: true });
}

function expectOverlayVisibilityRouting() {
  const deps = createOverlayDeps();
  const sendResponse = vi.fn();

  expect(
    handleRegionOverlayMessage(
      {
        type: VideoMessageType.REGION_SELECTED,
        ...createRegionSelectionBinding(),
        region: createRegion(),
      },
      sendResponse,
      deps
    )
  ).toBe(false);
  expect(deps.showRecordingOverlay).toHaveBeenCalledWith(createRegion());
  expect(sendResponse).not.toHaveBeenCalled();

  expect(
    handleRegionOverlayMessage(
      { type: VideoMessageType.SHOW_RECORDING_OVERLAY, region: createRegion() },
      sendResponse,
      deps
    )
  ).toBe(true);
  expect(deps.showRecordingOverlay).toHaveBeenCalledTimes(2);
  expect(sendResponse).toHaveBeenLastCalledWith({ success: true });
}

function expectOverlayNoRegionRouting() {
  const deps = createOverlayDeps();
  const sendResponse = vi.fn();

  expect(
    handleRegionOverlayMessage(
      { type: VideoMessageType.REGION_SELECTED } as never,
      sendResponse,
      deps
    )
  ).toBe(false);
  expect(deps.showRecordingOverlay).not.toHaveBeenCalled();
  expect(sendResponse).not.toHaveBeenCalled();

  expect(
    handleRegionOverlayMessage(
      { type: VideoMessageType.SHOW_RECORDING_OVERLAY } as never,
      sendResponse,
      deps
    )
  ).toBe(true);
  expect(deps.showRecordingOverlay).not.toHaveBeenCalled();
  expect(sendResponse).toHaveBeenCalledWith({ success: true });
}

function expectRecordingOverlayHideRouting() {
  const deps = createOverlayDeps();
  const sendResponse = vi.fn();

  expect(
    handleRegionOverlayMessage(
      { type: VideoMessageType.HIDE_RECORDING_OVERLAY },
      sendResponse,
      deps
    )
  ).toBe(true);

  expect(deps.hideRecordingOverlay).toHaveBeenCalledOnce();
  expect(sendResponse).toHaveBeenCalledWith({ success: true });
}

function expectDefaultMessageRouting() {
  expect(
    handleRegionOverlayMessage({ type: 'UNKNOWN' } as never, vi.fn(), createOverlayDeps())
  ).toBeNull();
}

function expectValidUnrelatedMessageIgnored() {
  expect(
    handleRegionOverlayMessage(
      { type: MessageType.SHOW_TOOLBAR } as never,
      vi.fn(),
      createOverlayDeps()
    )
  ).toBeNull();
}

function expectBridgeDepsFactory() {
  const logger = { debug: vi.fn() };
  createLogger.mockReturnValue(logger);
  const controller = {
    hideRecordingOverlay: vi.fn(),
    hideRegionSelector: vi.fn(),
    showRecordingOverlay: vi.fn(),
    showRegionSelector: vi.fn(),
  };

  expect(createRegionOverlayBridgeDeps(controller)).toEqual({
    ...controller,
    logger,
  });
  expect(createLogger).toHaveBeenCalledWith({
    namespace: 'ContentRegionOverlayBridge',
  });
}

describe('handleRegionOverlayMessage', () => {
  it(
    'shows and hides the region selector through injected overlay deps',
    expectSelectorVisibilityRouting
  );

  it('shows overlays only when a region payload is present', expectOverlayVisibilityRouting);
  it(
    'acknowledges overlay requests without showing overlays when region data is missing',
    expectOverlayNoRegionRouting
  );

  it('hides the recording overlay through injected deps', expectRecordingOverlayHideRouting);
  it('returns null for unrelated overlay messages', expectDefaultMessageRouting);
  it('returns null for valid non-overlay runtime messages', expectValidUnrelatedMessageIgnored);
});

describe('createRegionOverlayBridgeDeps', () => {
  it('adds a bridge-local logger to injected region selector controls', expectBridgeDepsFactory);
});
