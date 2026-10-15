import { afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  install: vi.fn(),
  connect: vi.fn(),
  lastError: vi.fn(),
  dispose: vi.fn(),
}));
vi.mock('@sniptale/platform/observability/logger', () => ({
  installDiagnosticLogObserver: mocks.install,
}));
vi.mock('@sniptale/platform/browser/runtime', () => ({
  browserRuntime: { connect: mocks.connect, getLastError: mocks.lastError },
}));
import { installDiagnosticPortCapture } from './diagnostic-capture';
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});
it('connects lazily, bounds a flood without timers, then reports dropped events', () => {
  vi.useFakeTimers();
  vi.setSystemTime(10000);
  const port = {
    postMessage: vi.fn(),
    disconnect: vi.fn(),
    onDisconnect: { addListener: vi.fn(), removeListener: vi.fn() },
  };
  mocks.connect.mockReturnValue(port);
  mocks.install.mockReturnValue(mocks.dispose);
  const dispose = installDiagnosticPortCapture();
  expect(mocks.connect).not.toHaveBeenCalled();
  const emit = mocks.install.mock.calls[0]![0];
  const event = {
    time: new Date().toISOString(),
    source: 'Capture',
    level: 'info',
    message: 'Ready',
  };
  for (let i = 0; i < 100; i++) emit(event);
  expect(port.postMessage).toHaveBeenCalledTimes(64);
  expect(vi.getTimerCount()).toBe(0);
  vi.setSystemTime(11000);
  emit(event);
  expect(port.postMessage.mock.calls[64]![0].message).toContain('36');
  dispose();
  expect(port.disconnect).toHaveBeenCalledOnce();
  expect(mocks.dispose).toHaveBeenCalledOnce();
});
it('contains unavailable extension errors without reconnecting for each log', () => {
  vi.useFakeTimers();
  vi.setSystemTime(10000);
  mocks.connect.mockImplementation(() => {
    throw new Error('invalidated');
  });
  mocks.install.mockReturnValue(mocks.dispose);
  const dispose = installDiagnosticPortCapture();
  const emit = mocks.install.mock.calls[0]![0];
  expect(() => {
    emit({});
    emit({});
  }).not.toThrow();
  expect(mocks.connect).toHaveBeenCalledOnce();
  dispose();
});
