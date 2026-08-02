import { afterEach, expect, it, vi } from 'vitest';

import { logIframeContentScriptLoad, logTopLevelContentScriptLoad } from './diagnostics';

afterEach(() => {
  Reflect.deleteProperty(globalThis, '__SNIPTALE_TRACE_NAMESPACES__');
});

it('logs top-level bootstrap context without logging iframe URLs by default', () => {
  const logger = { log: vi.fn() };

  logTopLevelContentScriptLoad(logger);
  logIframeContentScriptLoad('https://example.com/frame/path?token=secret#frag', logger);

  expect(logger.log).toHaveBeenNthCalledWith(
    1,
    expect.stringContaining('TOP-LEVEL document'),
    expect.any(String)
  );
  expect(logger.log).toHaveBeenCalledTimes(1);
});

it('logs redacted iframe bootstrap URLs only when iframe trace is enabled', () => {
  const logger = { log: vi.fn() };
  globalThis.__SNIPTALE_TRACE_NAMESPACES__ = ['ContentEntrypointDiagnostics:IframeLoad'];

  logIframeContentScriptLoad('https://example.com/frame/path?token=secret#frag', logger);

  expect(logger.log).toHaveBeenCalledWith(
    expect.stringContaining('IFRAME:'),
    expect.any(String),
    'https://example.com/frame/path'
  );
});
