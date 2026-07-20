import { afterEach, expect, it, vi } from 'vitest';

function setRulesUiFlag(value: boolean | undefined) {
  if (value === undefined) {
    Reflect.deleteProperty(globalThis, '__ENABLE_PAGE_STYLE_RULES__');
    return;
  }

  Object.defineProperty(globalThis, '__ENABLE_PAGE_STYLE_RULES__', {
    configurable: true,
    value,
  });
}

afterEach(() => {
  vi.resetModules();
  setRulesUiFlag(undefined);
});

it('returns the injected release/dev flag when it is defined', async () => {
  setRulesUiFlag(false);

  const { isPageStyleRulesUiEnabled } = await import('.');

  expect(isPageStyleRulesUiEnabled()).toBe(false);
});

it('defaults to enabled when the build flag is not injected', async () => {
  const { isPageStyleRulesUiEnabled } = await import('.');

  expect(isPageStyleRulesUiEnabled()).toBe(true);
});
