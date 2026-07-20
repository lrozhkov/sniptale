import { afterEach, expect, it, vi } from 'vitest';

function setDesignSystemFlag(value: boolean | undefined) {
  if (value === undefined) {
    Reflect.deleteProperty(globalThis, '__ENABLE_DESIGN_SYSTEM__');
    return;
  }

  Object.defineProperty(globalThis, '__ENABLE_DESIGN_SYSTEM__', {
    configurable: true,
    value,
  });
}

afterEach(() => {
  vi.resetModules();
  setDesignSystemFlag(undefined);
});

it('returns the injected flag when it is defined', async () => {
  setDesignSystemFlag(false);

  const { isDesignSystemEnabled } = await import('.');

  expect(isDesignSystemEnabled()).toBe(false);
});

it('defaults to enabled when the flag is not injected', async () => {
  const { isDesignSystemEnabled } = await import('.');

  expect(isDesignSystemEnabled()).toBe(true);
});
