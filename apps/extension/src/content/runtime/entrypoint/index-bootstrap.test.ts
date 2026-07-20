// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';

const entrypointMocks = vi.hoisted(() => ({
  initTracer: vi.fn(),
  initializeTopLevelContentEntry: vi.fn(),
  logIframeContentScriptLoad: vi.fn(),
}));

vi.mock('@sniptale/platform/observability/message-tracer', () => ({
  initTracer: entrypointMocks.initTracer,
}));

vi.mock('./bootstrap', () => ({
  initializeTopLevelContentEntry: entrypointMocks.initializeTopLevelContentEntry,
}));

vi.mock('./diagnostics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./diagnostics')>()),
  logIframeContentScriptLoad: entrypointMocks.logIframeContentScriptLoad,
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

it('does not patch console methods during normal top-level bootstrap', async () => {
  const originalLog = console.log;

  await import('../..');

  expect(console.log).toBe(originalLog);
  expect(entrypointMocks.initTracer).toHaveBeenCalledWith('cs');
  expect(entrypointMocks.initializeTopLevelContentEntry).toHaveBeenCalledOnce();
});
