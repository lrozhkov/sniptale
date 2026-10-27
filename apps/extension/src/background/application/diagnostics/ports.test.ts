import { afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  subscribe: vi.fn(),
  append: vi.fn(),
  maintenance: vi.fn(),
  history: vi.fn(),
  unsubscribe: vi.fn(),
}));
vi.mock('@sniptale/platform/browser/runtime', () => ({
  runtimeInfo: { getURL: (path: string) => `chrome-extension://own/${path}` },
  browserRuntime: {
    subscribeToConnections: mocks.subscribe,
    getURL: () => 'chrome-extension://own/',
  },
}));
vi.mock('../../../composition/persistence/diagnostics/runtime-log', () => ({
  createRuntimeLog: () => ({ append: mocks.append }),
}));
vi.mock('../../../composition/persistence/library-lifecycle/maintenance-log', () => ({
  createMaintenanceLog: () => ({ append: mocks.maintenance }),
}));
vi.mock('../../../workflows/sync-transfer/queue-history', () => ({
  deliverSyncQueueHistory: mocks.history,
}));
import { registerDiagnosticLogPorts } from './ports';
import { DIAGNOSTIC_LOG_PORT } from '../../../contracts/diagnostics';
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});
function setup(senderId = 'own') {
  vi.useFakeTimers();
  const port = {
    name: DIAGNOSTIC_LOG_PORT,
    sender: {
      id: senderId,
      tab: { id: 1 },
      frameId: 0,
      documentId: 'document',
      url: 'https://example.com/',
    },
    disconnect: vi.fn(),
    onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
    onDisconnect: { addListener: vi.fn(), removeListener: vi.fn() },
  };
  mocks.subscribe.mockReturnValue(mocks.unsubscribe);
  const dispose = registerDiagnosticLogPorts();
  const accept = mocks.subscribe.mock.calls.at(-1)![0];
  accept(port);
  return {
    port,
    dispose,
    accept,
    send: (raw: unknown) => port.onMessage.addListener.mock.calls[0]![0](raw),
  };
}
const event = {
  time: '2026-10-08T12:00:00.000Z',
  source: 'Capture',
  level: 'info',
  message: 'Ready',
};
it('rejects foreign senders without storage or console work', () => {
  const f = setup('foreign');
  expect(f.port.disconnect).toHaveBeenCalledOnce();
  expect(mocks.append).not.toHaveBeenCalled();
  f.dispose();
});
it('labels admitted summaries as content, rejects malformed input and releases handlers', () => {
  const f = setup();
  f.send(event);
  expect(mocks.append).toHaveBeenCalledWith(event, 'content');
  f.send({ ...event, message: 'x'.repeat(1001) });
  expect(f.port.disconnect).toHaveBeenCalledOnce();
  expect(f.port.onMessage.removeListener).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
  f.dispose();
});
it('bounds each connection and disconnects inactive ports', () => {
  const f = setup();
  for (let i = 0; i < 65; i++) f.send(event);
  expect(mocks.append).toHaveBeenCalledTimes(64);
  expect(f.port.disconnect).toHaveBeenCalledOnce();
  f.dispose();
  const other = setup();
  vi.advanceTimersByTime(3000);
  expect(other.port.disconnect).toHaveBeenCalledOnce();
  other.dispose();
});
it('caps open connections and disposes all timers', () => {
  const f = setup();
  for (let i = 0; i < 16; i++) f.accept({ ...f.port, disconnect: vi.fn() });
  expect(vi.getTimerCount()).toBe(16);
  f.dispose();
  expect(vi.getTimerCount()).toBe(0);
  expect(mocks.unsubscribe).toHaveBeenCalledOnce();
});

it.each([
  'apps/extension/src/settings/index.html',
  'apps/extension/src/offscreen/offscreen.html.evil',
])('rejects non-offscreen extension documents: %s', (path) => {
  const f = setup();
  const rejected = {
    ...f.port,
    sender: { id: 'own', documentId: 'doc', url: `chrome-extension://own/${path}` },
    disconnect: vi.fn(),
  };
  f.accept(rejected);
  expect(rejected.disconnect).toHaveBeenCalledOnce();
  f.dispose();
});

it('assigns offscreen context only to the exact extension document', () => {
  const f = setup();
  const offscreen = {
    ...f.port,
    sender: {
      id: 'own',
      documentId: 'offscreen',
      url: 'chrome-extension://own/apps/extension/src/offscreen/offscreen.html?offscreenStartupId=1',
    },
    onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
  };
  f.accept(offscreen);
  offscreen.onMessage.addListener.mock.calls[0]![0]({ ...event, context: 'content' });
  expect(mocks.append).toHaveBeenCalledWith(event, 'offscreen');
  f.dispose();
});

it('validates offscreen maintenance codes and metrics without accepting attached content', () => {
  const f = setup();
  const offscreen = {
    ...f.port,
    sender: {
      id: 'own',
      documentId: 'offscreen',
      url: 'chrome-extension://own/apps/extension/src/offscreen/offscreen.html',
    },
    onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
  };
  f.accept(offscreen);
  const input = { operation: 'physical-delete', code: 'deleted', counts: { deleted: 2 } };
  const send = offscreen.onMessage.addListener.mock.calls[0]![0];
  send({ kind: 'maintenance', input: { ...input, message: 'private', filename: 'private' } });
  expect(mocks.maintenance).toHaveBeenCalledWith(input);
  expect(mocks.append).not.toHaveBeenCalled();
  send({ kind: 'maintenance', input: { ...input, code: 'unknown' } });
  expect(mocks.maintenance).toHaveBeenCalledOnce();
  expect(offscreen.disconnect).toHaveBeenCalledOnce();
  f.dispose();
});
it('rejects structured maintenance from content even with valid fields', () => {
  const f = setup();
  f.send({ kind: 'maintenance', input: { operation: 'physical-delete', code: 'deleted' } });
  expect(mocks.maintenance).not.toHaveBeenCalled();
  expect(f.port.disconnect).toHaveBeenCalledOnce();
  f.dispose();
});

function historyPort() {
  const f = setup();
  const offscreen = {
    ...f.port,
    sender: {
      id: 'own',
      documentId: 'offscreen',
      url: 'chrome-extension://own/apps/extension/src/offscreen/offscreen.html',
    },
    onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
  };
  f.accept(offscreen);
  return {
    ...f,
    offscreen,
    hint: (raw: unknown) => offscreen.onMessage.addListener.mock.calls[0]![0](raw),
  };
}
const historyHint = {
  kind: 'sync-queue',
  input: {
    scope: { spaceId: 'space', connectionGeneration: 1, profileCreatedAt: 0 },
    source: { kind: 'operation', operationId: 'operation' },
  },
};
it('admits offscreen source hints only and never accepts attached event payloads', async () => {
  mocks.history.mockResolvedValue(true);
  const f = historyPort();
  f.hint({ ...historyHint, rows: ['private'], token: 'private' });
  expect(mocks.history).toHaveBeenCalledWith(historyHint.input.scope, historyHint.input.source);
  expect(mocks.append).not.toHaveBeenCalled();
  expect(mocks.maintenance).not.toHaveBeenCalled();
  await Promise.resolve();
  f.dispose();
});
it('rejects source hints from content and closes malformed offscreen submissions', () => {
  const f = setup();
  f.send(historyHint);
  expect(mocks.history).not.toHaveBeenCalled();
  expect(f.port.disconnect).toHaveBeenCalledOnce();
  f.dispose();
  const g = historyPort();
  g.hint({
    ...historyHint,
    input: { ...historyHint.input, source: { kind: 'operation', operationId: '' } },
  });
  expect(mocks.history).not.toHaveBeenCalled();
  expect(g.offscreen.disconnect).toHaveBeenCalledOnce();
  g.dispose();
});
it('coalesces duplicate hints, bounds pending delivery and permits retry after failure', async () => {
  const pending: (() => void)[] = [];
  mocks.history.mockImplementation(
    () =>
      new Promise<boolean>((resolve) => {
        pending.push(() => resolve(false));
      })
  );
  const f = historyPort();
  f.hint(historyHint);
  f.hint(historyHint);
  for (let i = 1; i <= 4; i++)
    f.hint({
      ...historyHint,
      input: { ...historyHint.input, source: { kind: 'operation', operationId: `operation-${i}` } },
    });
  expect(mocks.history).toHaveBeenCalledTimes(4);
  pending[0]!();
  await Promise.resolve();
  await Promise.resolve();
  f.hint(historyHint);
  expect(mocks.history).toHaveBeenCalledTimes(5);
  for (const release of pending) release();
  await Promise.resolve();
  await Promise.resolve();
  f.dispose();
});
it('contains a rejected delivery promise and releases its bounded pending slot', async () => {
  mocks.history.mockRejectedValue(new Error('storage unavailable'));
  const f = historyPort();
  f.hint(historyHint);
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  f.hint(historyHint);
  expect(mocks.history).toHaveBeenCalledTimes(2);
  await Promise.resolve();
  await Promise.resolve();
  f.dispose();
});
