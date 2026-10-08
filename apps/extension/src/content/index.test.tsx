// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  install: vi.fn(),
  dispose: vi.fn(),
  bootstrap: vi.fn(),
  tracer: vi.fn(),
}));
vi.mock('../platform/runtime-messaging/diagnostic-capture', () => ({
  installDiagnosticPortCapture: mocks.install,
}));
vi.mock('@sniptale/platform/observability/message-tracer', () => ({ initTracer: mocks.tracer }));
vi.mock('./runtime/entrypoint/bootstrap', () => ({
  initializeTopLevelContentEntry: mocks.bootstrap,
}));
vi.mock('./runtime/entrypoint/diagnostics', () => ({ logIframeContentScriptLoad: vi.fn() }));
afterEach(() => vi.restoreAllMocks());
it('installs diagnostics before content startup, disposes on hiding and reinstalls after BFCache restore', async () => {
  mocks.install.mockReturnValue(mocks.dispose);
  const listeners = vi.spyOn(window, 'addEventListener');
  await import('./index');
  expect(mocks.install).toHaveBeenCalledOnce();
  expect(mocks.bootstrap).toHaveBeenCalledOnce();
  window.dispatchEvent(new Event('pagehide'));
  expect(mocks.dispose).toHaveBeenCalledOnce();
  window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: false }));
  expect(mocks.install).toHaveBeenCalledOnce();
  window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
  expect(mocks.install).toHaveBeenCalledTimes(2);
  for (const [type, listener, options] of listeners.mock.calls)
    window.removeEventListener(type, listener, options);
});
