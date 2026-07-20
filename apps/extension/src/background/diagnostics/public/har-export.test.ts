import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getStartPreauthorization: vi.fn(),
  hasStartPreauthorization: vi.fn(),
  hasStopPreauthorization: vi.fn(),
  issueStartCapability: vi.fn(),
  startSession: vi.fn(),
  stopSession: vi.fn(),
}));

vi.mock('../export-har-collector', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../export-har-collector')>()),
  issueExportHarStartCapability: mocks.issueStartCapability,
  startExportHarSession: mocks.startSession,
  stopExportHarSession: mocks.stopSession,
}));

vi.mock('../export-har-collector/authorization/preauthorization', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../export-har-collector/authorization/preauthorization')
  >()),
  getPreauthorizedHarStartRouteMessage: mocks.getStartPreauthorization,
  hasPreauthorizedHarStartRouteMessage: mocks.hasStartPreauthorization,
  hasPreauthorizedHarStopRouteMessage: mocks.hasStopPreauthorization,
}));

import {
  isExportHarStartPreauthorized,
  isExportHarStopPreauthorized,
  issueExportHarStartCapability,
  startPreauthorizedExportHarSession,
  stopPreauthorizedExportHarSession,
} from './har-export';

beforeEach(() => {
  vi.clearAllMocks();
});

it('exposes capability issuance and route-authorization decisions without leaking handles', () => {
  const payload = {};
  mocks.hasStartPreauthorization.mockReturnValue(true);
  mocks.hasStopPreauthorization.mockReturnValue(false);
  mocks.issueStartCapability.mockReturnValue('capability-1');

  expect(isExportHarStartPreauthorized(payload)).toBe(true);
  expect(isExportHarStopPreauthorized(payload)).toBe(false);
  expect(
    issueExportHarStartCapability({ senderUrl: undefined, sessionId: 'har-1', tabId: 42 })
  ).toBe('capability-1');
});

it('starts only with an owner-held preauthorization handle', async () => {
  const payload = {};
  await expect(startPreauthorizedExportHarSession(payload, 'har-1', 42)).rejects.toThrow(
    'Missing HAR start capability token'
  );

  const preauthorization = { kind: 'preauthorized-har-start' };
  mocks.getStartPreauthorization.mockReturnValue(preauthorization);
  mocks.startSession.mockResolvedValue({ capabilityToken: 'stop-1' });

  await expect(
    startPreauthorizedExportHarSession(payload, 'har-1', 42, 'chrome-extension://test')
  ).resolves.toEqual({ capabilityToken: 'stop-1' });
  expect(mocks.startSession).toHaveBeenCalledWith(
    'har-1',
    42,
    preauthorization,
    'chrome-extension://test'
  );
});

it('stops only for a preauthorized route payload', async () => {
  const payload = {};
  mocks.hasStopPreauthorization.mockReturnValue(false);
  await expect(stopPreauthorizedExportHarSession(payload, 'har-1', 42, 'stop-1')).rejects.toThrow(
    'Missing HAR capability token'
  );

  mocks.hasStopPreauthorization.mockReturnValue(true);
  mocks.stopSession.mockResolvedValue({ har: { entries: [] } });

  await expect(stopPreauthorizedExportHarSession(payload, 'har-1', 42, 'stop-1')).resolves.toEqual({
    har: { entries: [] },
  });
  expect(mocks.stopSession).toHaveBeenCalledWith('har-1', 42, 'stop-1');
});
