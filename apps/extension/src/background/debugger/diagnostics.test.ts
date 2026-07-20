import { beforeEach, describe, expect, it, vi } from 'vitest';

const { sendCommand, withTimeout } = vi.hoisted(() => ({
  sendCommand: vi.fn(),
  withTimeout: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/debugger', () => ({
  browserDebugger: {
    sendCommand,
  },
}));

vi.mock('./infra', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./infra')>()),
  withTimeout,
}));

vi.mock('./constants', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./constants')>()),
  DEBUGGER_TIMEOUT_MS: 3210,
}));

import { disableDiagnosticsDomains, enableDiagnosticsDomains } from './diagnostics';
import { disableDiagnosticsDomainsForPrivacyErasure } from './privacy-erasure';

beforeEach(() => {
  vi.clearAllMocks();
  sendCommand.mockResolvedValue(undefined);
  withTimeout.mockImplementation((promise: Promise<unknown>) => promise);
});

describe('debugger diagnostics domains', () => {
  it('enables Runtime and Network domains with timeout protection', async () => {
    await enableDiagnosticsDomains(7);

    expect(sendCommand).toHaveBeenNthCalledWith(1, { tabId: 7 }, 'Runtime.enable', {});
    expect(sendCommand).toHaveBeenNthCalledWith(2, { tabId: 7 }, 'Network.enable', {
      maxResourceBufferSize: 5000000,
      maxTotalBufferSize: 10000000,
    });
    expect(withTimeout).toHaveBeenNthCalledWith(1, expect.any(Promise), 3210, 'Runtime.enable');
    expect(withTimeout).toHaveBeenNthCalledWith(2, expect.any(Promise), 3210, 'Network.enable');
  });

  it('rethrows failures while enabling diagnostics domains', async () => {
    const error = new Error('Runtime failed');
    withTimeout.mockRejectedValueOnce(error);

    await expect(enableDiagnosticsDomains(9)).rejects.toThrow('Runtime failed');
  });

  it('disables Runtime and Network domains and swallows cleanup errors', async () => {
    await expect(disableDiagnosticsDomains(11)).resolves.toBeUndefined();
    expect(sendCommand).toHaveBeenNthCalledWith(1, { tabId: 11 }, 'Network.disable', {});
    expect(sendCommand).toHaveBeenNthCalledWith(2, { tabId: 11 }, 'Runtime.disable', {});

    withTimeout.mockRejectedValueOnce(new Error('detach failed'));
    await expect(disableDiagnosticsDomains(11)).resolves.toBeUndefined();
  });

  it('surfaces privacy-erasure domain shutdown failures', async () => {
    await disableDiagnosticsDomainsForPrivacyErasure(12);
    expect(withTimeout).toHaveBeenNthCalledWith(
      1,
      expect.any(Promise),
      3210,
      'privacy.Network.disable'
    );
    expect(withTimeout).toHaveBeenNthCalledWith(
      2,
      expect.any(Promise),
      3210,
      'privacy.Runtime.disable'
    );

    withTimeout.mockRejectedValueOnce(new Error('strict disable failed'));
    await expect(disableDiagnosticsDomainsForPrivacyErasure(12)).rejects.toThrow(
      'strict disable failed'
    );
  });
});
