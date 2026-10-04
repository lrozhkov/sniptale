import { afterEach, expect, it, vi } from 'vitest';
import {
  ADDITIONAL_BROWSER_VIEWPORTS,
  PRIMARY_BROWSER_VIEWPORTS,
  resolveBrowserViewport,
} from './browser-viewport';

afterEach(() => vi.unstubAllEnvs());

it('defaults to the typical application viewport and returns independent values', () => {
  vi.stubEnv('SNIPTALE_E2E_VIEWPORT', undefined);
  const first = resolveBrowserViewport();
  expect(first).toEqual({ width: 1920, height: 900 });
  first.width = 1;
  expect(resolveBrowserViewport()).toEqual({ width: 1920, height: 900 });
});

it.each([...PRIMARY_BROWSER_VIEWPORTS, ...ADDITIONAL_BROWSER_VIEWPORTS])(
  'selects the $name preset from the environment',
  ({ name, size }) => {
    vi.stubEnv('SNIPTALE_E2E_VIEWPORT', name);
    expect(resolveBrowserViewport()).toEqual(size);
  }
);

it('honors an explicit preset before the environment', () => {
  vi.stubEnv('SNIPTALE_E2E_VIEWPORT', '1536x700');
  expect(resolveBrowserViewport('1280x560')).toEqual({ width: 1280, height: 560 });
});

it.each(['', 'mobile', '1280x720', '1920x900 '])('rejects invalid preset %j', (value) => {
  expect(() => resolveBrowserViewport(value)).toThrow(/SNIPTALE_E2E_VIEWPORT must be one of/u);
});
