import { beforeEach, expect, it, vi } from 'vitest';

const dictionaryMocks = vi.hoisted(() => ({
  resolveMessageSource: vi.fn((_source: unknown, locale: string) => ({ locale })),
}));

vi.mock('./messages/source', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./messages/source')>()),
  resolveMessageSource: dictionaryMocks.resolveMessageSource,
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

it('does not materialize full locale dictionaries when the module is imported', async () => {
  const dictionaries = await import('./dictionaries');

  expect(dictionaryMocks.resolveMessageSource).not.toHaveBeenCalled();

  dictionaries.getResolvedDictionaries();
  expect(dictionaryMocks.resolveMessageSource).toHaveBeenCalledTimes(2);
});
