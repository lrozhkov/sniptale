import { beforeEach, expect, it, vi } from 'vitest';

const {
  processQuickActionMock,
  notifyDuplicateCaptureMock,
  notifyQuickActionErrorMock,
  assertQuickActionSupportedMock,
  loggerLogMock,
  loggerErrorMock,
  loggerWarnMock,
} = vi.hoisted(() => ({
  processQuickActionMock: vi.fn(),
  notifyDuplicateCaptureMock: vi.fn(),
  notifyQuickActionErrorMock: vi.fn(),
  assertQuickActionSupportedMock: vi.fn(),
  loggerLogMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  loggerWarnMock: vi.fn(),
}));

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: () => ({
    log: loggerLogMock,
    error: loggerErrorMock,
    warn: loggerWarnMock,
  }),
}));

vi.mock('./flow/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./flow/index')>()),
  processQuickAction: processQuickActionMock,
}));

vi.mock('./capability', () => ({
  assertQuickActionSupported: assertQuickActionSupportedMock,
}));

vi.mock('./notifications', () => ({
  notifyDuplicateCapture: notifyDuplicateCaptureMock,
  notifyQuickActionError: notifyQuickActionErrorMock,
}));

import { handleQuickAction } from './index';
import { TabRuntimeCapability } from '@sniptale/runtime-contracts/tab-capabilities/types';

function createArgs() {
  return {
    actionId: 'action-1',
    tabId: 12,
    tab: { id: 12, url: 'https://example.test' } as chrome.tabs.Tab,
    viewportState: new Map<number, { width: number; height: number } | null>(),
    screenshotModeState: new Map<number, boolean>(),
    captureGuardState: { isCapturing: false },
    pageAccessPort: {
      ensureActivePageAccessRuntime: vi.fn(),
      ensureNativeVisibleCaptureAuthority: vi.fn(),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  processQuickActionMock.mockResolvedValue({ result: 'accepted' });
  assertQuickActionSupportedMock.mockImplementation(() => undefined);
  notifyDuplicateCaptureMock.mockImplementation(() => undefined);
  notifyQuickActionErrorMock.mockImplementation(() => undefined);
});

it('short-circuits duplicate captures', async () => {
  const args = createArgs();
  args.captureGuardState.isCapturing = true;

  await handleQuickAction(args);

  expect(processQuickActionMock).not.toHaveBeenCalled();
  expect(assertQuickActionSupportedMock).not.toHaveBeenCalled();
  expect(notifyDuplicateCaptureMock).toHaveBeenCalledWith(12);
  expect(args.captureGuardState.isCapturing).toBe(true);
});

it('rejects unsupported tabs before entering the capture flow', async () => {
  const args = createArgs();
  assertQuickActionSupportedMock.mockImplementation(() => {
    throw new Error('Blocked on this tab');
  });

  await expect(handleQuickAction(args)).resolves.toEqual({
    result: 'failed',
    error: 'Blocked on this tab',
  });

  expect(processQuickActionMock).not.toHaveBeenCalled();
  expect(args.captureGuardState.isCapturing).toBe(false);
});

it('normalizes non-error unsupported-tab failures', async () => {
  const args = createArgs();
  assertQuickActionSupportedMock.mockImplementation(() => {
    throw 'unsupported';
  });

  await expect(handleQuickAction(args)).resolves.toEqual({
    result: 'failed',
    error: 'unsupported',
  });
});

it('delegates to processQuickAction and resets the capture guard on success', async () => {
  const args = createArgs();

  await handleQuickAction(args);

  expect(processQuickActionMock).toHaveBeenCalledWith({
    actionId: 'action-1',
    tabId: 12,
    viewportState: args.viewportState,
    screenshotModeState: args.screenshotModeState,
    pageCapability: TabRuntimeCapability.Regular,
    pageAccessPort: args.pageAccessPort,
  });
  expect(args.captureGuardState.isCapturing).toBe(false);
});

it('returns blocked flow results while resetting the capture guard', async () => {
  const args = createArgs();
  processQuickActionMock.mockResolvedValue({ result: 'blocked' });

  await expect(handleQuickAction(args)).resolves.toEqual({ result: 'blocked' });

  expect(processQuickActionMock).toHaveBeenCalledWith(
    expect.objectContaining({ pageAccessPort: args.pageAccessPort })
  );
  expect(args.captureGuardState.isCapturing).toBe(false);
});

it('logs and notifies when processQuickAction throws', async () => {
  const args = createArgs();
  processQuickActionMock.mockRejectedValue(new Error('quick action failed'));

  await handleQuickAction(args);

  expect(loggerErrorMock).toHaveBeenCalledWith('Quick action failed', expect.any(Error));
  expect(notifyQuickActionErrorMock).toHaveBeenCalledWith(12, expect.any(Error));
  expect(args.captureGuardState.isCapturing).toBe(false);
});

it('normalizes non-error quick-action flow failures', async () => {
  const args = createArgs();
  processQuickActionMock.mockRejectedValue('quick action failed');

  await expect(handleQuickAction(args)).resolves.toEqual({
    result: 'failed',
    error: 'quick action failed',
  });
  expect(args.captureGuardState.isCapturing).toBe(false);
});
