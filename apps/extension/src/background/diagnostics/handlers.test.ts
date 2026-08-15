import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  acquirePermit: vi.fn(),
  getById: vi.fn(),
  getByTab: vi.fn(),
  getRecordingId: vi.fn(),
  flush: vi.fn(),
  warn: vi.fn(),
}));

vi.mock('./lifecycle-gate', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./lifecycle-gate')>()),
  acquireDiagnosticsMutationPermit: mocks.acquirePermit,
}));
vi.mock('./state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./state')>()),
  getActiveRecordingId: mocks.getRecordingId,
  getDiagnosticsSession: mocks.getById,
  getDiagnosticsSessionByTabId: mocks.getByTab,
  maybeFlushDiagnosticsSession: mocks.flush,
}));
vi.mock('./logger', () => ({
  diagnosticsLogger: { warn: mocks.warn },
}));

import { handleEventFromContentScript, handleTabNavigation } from './handlers';

function session() {
  return {
    events: [] as Array<Record<string, unknown>>,
    isPaused: false,
    meta: {},
    recordingId: 'recording-1',
    startedAt: 10,
    tabId: 7,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.acquirePermit.mockReturnValue(vi.fn());
  vi.spyOn(performance, 'now').mockReturnValue(25);
  vi.spyOn(crypto, 'randomUUID').mockReturnValue('123e4567-e89b-12d3-a456-426614174000');
});

it('records sanitized content actions only for an active unpaused session', () => {
  const active = session();
  mocks.getRecordingId.mockReturnValue('recording-1');
  mocks.getById.mockReturnValue(active);

  handleEventFromContentScript({ kind: 'action', message: 'click' }, 7);
  expect(active.events).toHaveLength(1);
  expect(mocks.flush).toHaveBeenCalledWith(active);

  active.isPaused = true;
  handleEventFromContentScript({ kind: 'error', message: 'failed' }, 7);
  expect(active.events).toHaveLength(1);

  mocks.getRecordingId.mockReturnValue(undefined);
  handleEventFromContentScript({ kind: 'action', message: 'ignored' }, 8);
  expect(mocks.warn).toHaveBeenCalled();
});

it('records navigation meta events with optional URLs and respects mutation admission', () => {
  const active = session();
  mocks.getByTab.mockReturnValue(active);

  handleTabNavigation(7, 'https://example.test/next');
  handleTabNavigation(7);
  expect(active.events).toEqual([
    expect.objectContaining({ kind: 'meta', data: { url: 'https://example.test/next' } }),
    expect.not.objectContaining({ data: expect.anything() }),
  ]);

  active.isPaused = true;
  handleTabNavigation(7, 'https://example.test/ignored');
  mocks.getByTab.mockReturnValue(undefined);
  handleTabNavigation(8);
  expect(active.events).toHaveLength(2);

  mocks.acquirePermit.mockReturnValueOnce(null);
  handleTabNavigation(7);
  expect(mocks.getByTab).toHaveBeenCalledTimes(4);
});
