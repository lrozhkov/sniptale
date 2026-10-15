import { afterEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({
  connect: vi.fn(),
  stored: {} as Record<string, unknown>,
}));
vi.mock('@sniptale/platform/browser/runtime', () => ({
  browserRuntime: {
    connect: state.connect,
    getURL: (path: string) => `chrome-extension://own/${path}`,
    getLastError: () => undefined,
  },
  runtimeInfo: { getURL: (path: string) => `chrome-extension://own/${path}` },
}));
vi.mock('@sniptale/platform/observability/message-tracer', () => ({ initTracer: vi.fn() }));
vi.mock('../../platform/runtime-messaging/index', () => ({
  sendRuntimeMessage: async () => undefined,
}));
import { bootstrapOffscreenDocument } from './bootstrap';
import {
  createRuntimeLog,
  RUNTIME_LOG_STORAGE_KEY,
} from '../../composition/persistence/diagnostics/runtime-log';
import { installDiagnosticLogObserver } from '@sniptale/platform/observability/logger';
import { DIAGNOSTIC_LOG_PORT, parseDiagnosticLogEvent } from '../../contracts/diagnostics';
afterEach(() => {
  installDiagnosticLogObserver(() => undefined)();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it('delivers actual offscreen bootstrap logs through background without chrome.storage', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('chrome', { runtime: {} });
  vi.stubGlobal('location', {
    href: 'chrome-extension://own/apps/extension/src/offscreen/offscreen.html?offscreenStartupId=current',
  });
  const receiver = createRuntimeLog({
    area: {
      get: async () => state.stored,
      set: async (value) => {
        state.stored = value;
      },
    },
    withLock: async (work) => work(),
  });
  const port = {
    name: DIAGNOSTIC_LOG_PORT,
    sender: { id: 'own', url: location.href, documentId: 'offscreen-document' },
    disconnect: vi.fn(),
    onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
    onDisconnect: { addListener: vi.fn(), removeListener: vi.fn() },
    postMessage: (raw: unknown) => {
      const event = parseDiagnosticLogEvent(raw);
      if (event) receiver.append(event, 'offscreen');
    },
  };
  state.connect.mockReturnValue(port);
  bootstrapOffscreenDocument();
  await vi.advanceTimersByTimeAsync(1000);
  expect(state.connect).toHaveBeenCalledOnce();
  expect(state.stored[RUNTIME_LOG_STORAGE_KEY]).toMatchObject({
    entries: [
      expect.objectContaining({ context: 'offscreen', message: 'Offscreen transport ready' }),
    ],
  });
});
