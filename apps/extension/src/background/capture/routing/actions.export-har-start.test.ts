import { beforeEach, expect, it, vi } from 'vitest';

const { isExportHarStartPreauthorizedMock, startPreauthorizedExportHarSessionMock } = vi.hoisted(
  () => ({
    isExportHarStartPreauthorizedMock: vi.fn(),
    startPreauthorizedExportHarSessionMock: vi.fn(),
  })
);

vi.mock('../../diagnostics/public/har-export', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../diagnostics/public/har-export')>()),
  isExportHarStartPreauthorized: isExportHarStartPreauthorizedMock,
  startPreauthorizedExportHarSession: startPreauthorizedExportHarSessionMock,
}));

import { handleExportStartHar } from './actions.export';

beforeEach(() => {
  vi.clearAllMocks();
  isExportHarStartPreauthorizedMock.mockReturnValue(true);
  startPreauthorizedExportHarSessionMock.mockResolvedValue({
    capabilityToken: 'har-token',
    expiresAtEpochMs: 123,
  });
});

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

it('handles HAR start validation branches', async () => {
  const missingStartResponse = vi.fn();
  const missingStartTokenResponse = vi.fn();
  isExportHarStartPreauthorizedMock.mockReturnValue(false);

  expect(handleExportStartHar({}, 42, missingStartResponse)).toBe(true);
  expect(handleExportStartHar({ sessionId: 'har-1' }, 42, missingStartTokenResponse)).toBe(true);

  await flushPromises();

  expect(missingStartResponse).toHaveBeenCalledWith({
    success: false,
    error: 'Missing HAR session id',
  });
  expect(missingStartTokenResponse).toHaveBeenCalledWith({
    success: false,
    error: 'Missing HAR start capability token',
  });
});

it('does not start HAR without a preauthorized route payload', async () => {
  const response = vi.fn();
  isExportHarStartPreauthorizedMock.mockReturnValue(false);

  expect(handleExportStartHar({ sessionId: 'har-1' }, 42, response)).toBe(true);

  await flushPromises();

  expect(response).toHaveBeenCalledWith({
    success: false,
    error: 'Missing HAR start capability token',
  });
  expect(startPreauthorizedExportHarSessionMock).not.toHaveBeenCalled();
});

it('starts HAR with the recovered preauthorization handle', async () => {
  const startSuccessResponse = vi.fn();
  const payload = { capabilityToken: 'start-token-1', sessionId: 'har-1' };
  startPreauthorizedExportHarSessionMock.mockResolvedValueOnce({
    capabilityToken: 'har-token-1',
    expiresAtEpochMs: 123,
  });

  expect(handleExportStartHar(payload, 42, startSuccessResponse)).toBe(true);

  await flushPromises();

  expect(startSuccessResponse).toHaveBeenCalledWith({
    success: true,
    result: 'accepted',
    capabilityToken: 'har-token-1',
    expiresAtEpochMs: 123,
  });
  expect(startPreauthorizedExportHarSessionMock).toHaveBeenCalledWith(
    payload,
    'har-1',
    42,
    undefined
  );
});

it('reports HAR start failures after preauthorized owner handoff', async () => {
  const startFailureResponse = vi.fn();
  const payload = { capabilityToken: 'start-token-2', sessionId: 'har-2' };
  startPreauthorizedExportHarSessionMock.mockRejectedValueOnce('har start failed');

  expect(handleExportStartHar(payload, 42, startFailureResponse)).toBe(true);

  await flushPromises();

  expect(startPreauthorizedExportHarSessionMock).toHaveBeenCalledWith(
    payload,
    'har-2',
    42,
    undefined
  );
  expect(startFailureResponse).toHaveBeenCalledWith({
    success: false,
    error: 'har start failed',
  });
});
