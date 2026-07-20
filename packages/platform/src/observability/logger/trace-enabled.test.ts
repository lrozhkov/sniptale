// @vitest-environment jsdom

import { afterEach, expect, it, vi } from 'vitest';

import { isTraceEnabled } from './trace-enabled';

const STORAGE_KEY = 'sniptale:trace:namespaces';

afterEach(() => {
  Reflect.deleteProperty(globalThis, '__SNIPTALE_TRACE_NAMESPACES__');
  localStorage.clear();
  vi.restoreAllMocks();
});

it('matches exact and child namespaces from a filtered explicit array', () => {
  globalThis.__SNIPTALE_TRACE_NAMESPACES__ = ['', 'capture'];

  expect(isTraceEnabled('capture')).toBe(true);
  expect(isTraceEnabled('capture:full-page')).toBe(true);
  expect(isTraceEnabled('editor')).toBe(false);
});

it('trims explicit comma-separated namespaces and supports the wildcard', () => {
  globalThis.__SNIPTALE_TRACE_NAMESPACES__ = ' , diagnostics, * ';

  expect(isTraceEnabled('unrelated')).toBe(true);
});

it('uses storage only when there is no explicit namespace selection', () => {
  localStorage.setItem(STORAGE_KEY, ' storage-owner, ');

  expect(isTraceEnabled('storage-owner:child')).toBe(true);

  globalThis.__SNIPTALE_TRACE_NAMESPACES__ = 'different-owner';
  expect(isTraceEnabled('storage-owner')).toBe(false);
});

it('fails closed when storage access throws', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('storage unavailable');
  });

  expect(isTraceEnabled('capture')).toBe(false);
});
