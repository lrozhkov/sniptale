import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';

const parseContentTabMessage = vi.fn();
const handleCoreModeMessage = vi.fn();
const handleViewportMessage = vi.fn();
const handleRegionCaptureMessage = vi.fn();
const handleRegionOverlayMessage = vi.fn();
const createRegionOverlayBridgeDeps = vi.fn();

vi.mock('../../../contracts/messaging/parsers/boundary', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../contracts/messaging/parsers/boundary')>()),
  parseContentTabMessage,
}));

vi.mock('./core', () => ({
  handleCoreModeMessage,
}));

vi.mock('./viewport', () => ({
  handleViewportMessage,
}));

vi.mock('./region-capture', () => ({
  handleRegionCaptureMessage,
}));

vi.mock('./region-overlay', () => ({
  createRegionOverlayBridgeDeps,
  handleRegionOverlayMessage,
}));

function resetContentRuntimeBridgeMocks() {
  vi.clearAllMocks();
  handleCoreModeMessage.mockReturnValue(null);
  handleViewportMessage.mockReturnValue(null);
  handleRegionCaptureMessage.mockReturnValue(null);
  createRegionOverlayBridgeDeps.mockReturnValue({});
  handleRegionOverlayMessage.mockReturnValue(null);
}

function createViewportInfo() {
  return {
    devicePixelRatio: 1,
    height: 0,
    outerHeight: 0,
    outerWidth: 0,
    scrollX: 0,
    scrollY: 0,
    width: 0,
    x: 0,
    y: 0,
  };
}

function createRegionSelectorControllerDeps() {
  return {
    hideRecordingOverlay: vi.fn(),
    hideRegionSelector: vi.fn(),
    showRecordingOverlay: vi.fn(),
    showRegionSelector: vi.fn(),
  };
}

async function expectFirstHandlerWins() {
  const parsedMessage = { type: 'ENABLE_SCREENSHOT_MODE' };
  parseContentTabMessage.mockReturnValue(parsedMessage);
  handleCoreModeMessage.mockReturnValue(false);

  const { createContentRuntimeMessageListener } = await import('.');
  const listener = createContentRuntimeMessageListener(
    vi.fn(() => createViewportInfo()),
    {
      regionSelectorController: createRegionSelectorControllerDeps(),
    }
  );

  expect(
    listener({ type: 'ENABLE_SCREENSHOT_MODE' }, {} as chrome.runtime.MessageSender, vi.fn())
  ).toBe(false);
  expect(handleCoreModeMessage).toHaveBeenCalledWith(parsedMessage);
  expect(handleViewportMessage).not.toHaveBeenCalled();
  expect(handleRegionCaptureMessage).not.toHaveBeenCalled();
  expect(handleRegionOverlayMessage).not.toHaveBeenCalled();
}

async function expectInvalidPayloadStopsAtBoundary() {
  const parseError = new Error('bad payload');
  parseContentTabMessage.mockImplementation(() => {
    throw parseError;
  });
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

  const { createContentRuntimeMessageListener } = await import('.');
  const listener = createContentRuntimeMessageListener(vi.fn(), {
    regionSelectorController: createRegionSelectorControllerDeps(),
  });

  expect(
    listener({ type: 'ENABLE_SCREENSHOT_MODE' }, {} as chrome.runtime.MessageSender, vi.fn())
  ).toBe(false);
  expect(warnSpy).toHaveBeenCalled();
  expect(handleCoreModeMessage).not.toHaveBeenCalled();
}

async function expectLaterHandlerPayloadPassesThrough() {
  const parsedMessage = { type: 'CHECK_REGION_CAPTURE_SUPPORT' };
  const supportPayload = {
    cropTo: true,
    produceCropTarget: true,
    supported: true,
  };
  parseContentTabMessage.mockReturnValue(parsedMessage);
  handleRegionCaptureMessage.mockReturnValue(supportPayload);

  const { createContentRuntimeMessageListener } = await import('.');
  const listener = createContentRuntimeMessageListener(vi.fn(), {
    regionSelectorController: createRegionSelectorControllerDeps(),
  });

  expect(
    listener({ type: 'CHECK_REGION_CAPTURE_SUPPORT' }, {} as chrome.runtime.MessageSender, vi.fn())
  ).toEqual(supportPayload);
  expect(handleCoreModeMessage).toHaveBeenCalledWith(parsedMessage);
  expect(handleViewportMessage).toHaveBeenCalled();
  expect(handleRegionCaptureMessage).toHaveBeenCalledWith(parsedMessage, expect.any(Function));
  expect(handleRegionOverlayMessage).not.toHaveBeenCalled();
}

async function expectUiOnlyMessagesAreIgnoredBeforeParsing() {
  const { createContentRuntimeMessageListener } = await import('.');
  const listener = createContentRuntimeMessageListener(vi.fn(), {
    regionSelectorController: createRegionSelectorControllerDeps(),
  });

  expect(
    listener({ type: MessageType.SHOW_TOOLBAR }, {} as chrome.runtime.MessageSender, vi.fn())
  ).toBe(false);
  expect(parseContentTabMessage).not.toHaveBeenCalled();
  expect(handleCoreModeMessage).not.toHaveBeenCalled();
}

describe('createContentRuntimeMessageListener', () => {
  beforeEach(() => {
    resetContentRuntimeBridgeMocks();
  });

  it('stops at the first runtime handler that returns a result', expectFirstHandlerWins);

  it(
    'returns false for invalid raw runtime payloads before routing',
    expectInvalidPayloadStopsAtBoundary
  );

  it('returns direct payload results from later handlers', expectLaterHandlerPayloadPassesThrough);
  it(
    'ignores UI-only runtime messages before content parsing',
    expectUiOnlyMessagesAreIgnoredBeforeParsing
  );
});
