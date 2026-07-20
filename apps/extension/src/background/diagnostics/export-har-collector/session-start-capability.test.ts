import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const browserDebuggerSendCommandMock = vi.hoisted(() => vi.fn());
const browserTabsGetMock = vi.hoisted(() => vi.fn());
const runtimeInfoGetManifestMock = vi.hoisted(() => vi.fn());
const attachDebugger = vi.hoisted(() => vi.fn());
const detachDebugger = vi.hoisted(() => vi.fn());

vi.mock('../../debugger/session/attach', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../debugger/session/attach')>()),
  attachDebugger,
}));

vi.mock('../../debugger/session/detach', () => ({ detachDebugger }));

vi.mock('@sniptale/platform/browser/debugger', async (importOriginal) => {
  const original = await importOriginal<typeof import('@sniptale/platform/browser/debugger')>();
  return {
    ...original,
    browserDebugger: { ...original.browserDebugger, sendCommand: browserDebuggerSendCommandMock },
  };
});

vi.mock('@sniptale/platform/browser/tabs', () => ({
  browserTabs: { get: browserTabsGetMock },
}));

vi.mock('@sniptale/platform/browser/runtime', async (importOriginal) => {
  const original = await importOriginal<typeof import('@sniptale/platform/browser/runtime')>();
  return {
    ...original,
    runtimeInfo: { ...original.runtimeInfo, getManifest: runtimeInfoGetManifestMock },
  };
});

import { startExportHarSession, stopExportHarSession } from './session';
import {
  consumeExportHarStartCapability,
  issueExportHarStartCapability,
  type ExportHarStartPreauthorization,
} from './start-capability';

const senderUrl = 'chrome-extension://sniptale/content.js';

beforeEach(() => {
  vi.clearAllMocks();
  attachDebugger.mockResolvedValue('target-1');
  browserDebuggerSendCommandMock
    .mockResolvedValueOnce(undefined)
    .mockResolvedValueOnce({ product: 'Chrome/123.0.0.0' });
  browserTabsGetMock.mockResolvedValue({ url: 'https://example.test/page' });
  detachDebugger.mockResolvedValue(undefined);
  runtimeInfoGetManifestMock.mockReturnValue({ version: '0.4.0' });
});

afterEach(() => {
  vi.useRealTimers();
});

function issueStartToken(
  sessionId: string,
  tabId: number,
  origin = senderUrl,
  rawDiagnosticsEnabled = false
): string {
  return issueExportHarStartCapability({
    rawDiagnosticsEnabled,
    senderUrl: origin,
    sessionId,
    tabId,
  });
}

function expectNoDebuggerStartSideEffects(): void {
  expect(attachDebugger).not.toHaveBeenCalled();
  expect(browserDebuggerSendCommandMock).not.toHaveBeenCalled();
}

it('rejects wrong HAR start tokens before debugger side effects', async () => {
  await expect(startExportHarSession('session-wrong-token', 7, 'wrong-token')).rejects.toThrow(
    'rejected an invalid start capability token'
  );

  expectNoDebuggerStartSideEffects();
});

it('rejects direct HAR start bypass values before debugger side effects', async () => {
  await expect(
    Reflect.apply(startExportHarSession, undefined, ['session-boolean-bypass', 7, true])
  ).rejects.toThrow('requires a start capability token');
  await expect(
    startExportHarSession(
      'session-object-bypass',
      7,
      {} as ExportHarStartPreauthorization,
      senderUrl
    )
  ).rejects.toThrow('rejected an invalid start preauthorization');

  expectNoDebuggerStartSideEffects();
});

it('rejects wrong-tab, wrong-session, and wrong-origin start tokens before attach', async () => {
  await expect(
    startExportHarSession('session-tab', 8, issueStartToken('session-tab', 7))
  ).rejects.toThrow('rejected an invalid start capability token');
  await expect(
    startExportHarSession('session-other', 9, issueStartToken('session-owner', 9))
  ).rejects.toThrow('rejected an invalid start capability token');
  await expect(
    startExportHarSession(
      'session-origin',
      10,
      issueStartToken('session-origin', 10, 'chrome-extension://other/content.js'),
      senderUrl
    )
  ).rejects.toThrow('rejected an invalid start capability token');

  expectNoDebuggerStartSideEffects();
});

it('rejects replayed HAR start tokens before a second debugger attach', async () => {
  const token = issueStartToken('session-replay', 11);
  const handle = await startExportHarSession('session-replay', 11, token, senderUrl);
  vi.clearAllMocks();
  browserDebuggerSendCommandMock.mockResolvedValue(undefined);

  await expect(startExportHarSession('session-replay', 11, token, senderUrl)).rejects.toThrow(
    'rejected an invalid start capability token'
  );

  expectNoDebuggerStartSideEffects();
  await stopExportHarSession('session-replay', 11, handle.capabilityToken);
});

it('starts once from a consumed facade preauthorization handle', async () => {
  const token = issueStartToken('session-preauthorized', 13, senderUrl, true);
  const preauthorization = consumeExportHarStartCapability({
    capabilityToken: token,
    senderUrl,
    sessionId: 'session-preauthorized',
    tabId: 13,
  });

  const handle = await startExportHarSession(
    'session-preauthorized',
    13,
    preauthorization,
    senderUrl
  );

  expect(attachDebugger).toHaveBeenCalledTimes(1);
  await expect(
    stopExportHarSession('session-preauthorized', 13, handle.capabilityToken)
  ).resolves.toEqual(expect.objectContaining({ rawDiagnosticsEnabled: true }));
  await expect(
    startExportHarSession('session-preauthorized-replay', 13, preauthorization, senderUrl)
  ).rejects.toThrow('rejected an invalid start preauthorization');
});

it('rejects stale HAR start tokens before debugger side effects', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-06-15T12:00:00.000Z'));
  const token = issueStartToken('session-stale', 12);
  vi.setSystemTime(new Date('2026-06-15T12:02:00.000Z'));

  await expect(startExportHarSession('session-stale', 12, token, senderUrl)).rejects.toThrow(
    'rejected an invalid start capability token'
  );

  expectNoDebuggerStartSideEffects();
});
