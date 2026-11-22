import { describe, expect, it, vi } from 'vitest';
import { createCatalogStore, parseCatalogMessages } from './catalog-store';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('prepared translation catalogs', () => {
  it('loads only requested areas of the selected locale and English fallback', async () => {
    const load = vi.fn(async (locale: string, scope: string) => ({
      [`${scope}.label`]: `${locale} ${scope}`,
    }));
    const store = createCatalogStore<string, string>({ fallbackLocale: 'en', load });
    await store.prepare('de', ['content', 'common']);
    expect(load.mock.calls).toEqual([
      ['en', 'content'],
      ['en', 'common'],
      ['de', 'content'],
      ['de', 'common'],
    ]);
    expect(store.read('de', 'content.label')).toBe('de content');
    expect(store.has('de', 'editor.label')).toBe(false);
  });

  it('does not increase requests when eight other locales become available', async () => {
    const available = ['en', 'ru', 'de', 'fr', 'es', 'it', 'pt', 'ja', 'ko', 'zh'];
    const load = vi.fn(async (locale: string) => {
      expect(available).toContain(locale);
      return { 'common.ready': locale };
    });
    const store = createCatalogStore<string, string>({ fallbackLocale: 'en', load });
    await store.prepare('ru', ['common']);
    expect(load.mock.calls).toEqual([
      ['en', 'common'],
      ['ru', 'common'],
    ]);
  });

  it('coalesces parallel preparation and reads synchronously after completion', async () => {
    const gate = deferred<unknown>();
    const load = vi.fn(() => gate.promise);
    const store = createCatalogStore<string, string>({ fallbackLocale: 'en', load });
    const first = store.prepare('en', ['common', 'common']);
    const second = store.prepare('en', ['common']);
    await Promise.resolve();
    expect(load).toHaveBeenCalledTimes(1);
    gate.resolve({ 'common.ready': 'Ready' });
    await Promise.all([first, second]);
    expect(store.read('en', 'common.ready')).toBe('Ready');
    await store.prepare('en', ['common']);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('preserves empty strings and falls back only to prepared English messages', async () => {
    const store = createCatalogStore<string, string>({
      fallbackLocale: 'en',
      load: async (locale: string) =>
        locale === 'en'
          ? { 'common.empty': 'English', 'common.missing': 'Fallback' }
          : { 'common.empty': '' },
    });
    await store.prepare('ru', ['common']);
    expect(store.read('ru', 'common.empty')).toBe('');
    expect(store.read('ru', 'common.missing')).toBe('Fallback');
    expect(store.read('ru', 'unknown.key')).toBe('unknown.key');
  });

  it('retries a failed resource without loading completed resources again', async () => {
    let attempts = 0;
    const load = vi.fn(async (locale: string) => {
      if (locale === 'ru' && ++attempts === 1) throw new Error('read failed');
      return { 'common.ready': locale };
    });
    const store = createCatalogStore<string, string>({ fallbackLocale: 'en', load });
    await expect(store.prepare('ru', ['common'])).rejects.toThrow('read failed');
    expect(store.read('en', 'common.ready')).toBe('en');
    await store.prepare('ru', ['common']);
    expect(load.mock.calls).toEqual([
      ['en', 'common'],
      ['ru', 'common'],
      ['ru', 'common'],
    ]);
    expect(store.read('ru', 'common.ready')).toBe('ru');
  });

  it('does not publish malformed messages and permits a corrected resource retry', async () => {
    const load = vi.fn().mockResolvedValueOnce({ 'common.ready': 42 }).mockResolvedValue({
      'common.ready': 'Ready',
    });
    const store = createCatalogStore<string, string>({ fallbackLocale: 'en', load });
    await expect(store.prepare('en', ['common'])).rejects.toThrow('Invalid translation');
    expect(store.has('en', 'common.ready')).toBe(false);
    await store.prepare('en', ['common']);
    expect(store.read('en', 'common.ready')).toBe('Ready');
  });
});

it.each([null, [], 'text', { key: 'unscoped' }, { 'x.__proto__.y': 'invalid' }])(
  'rejects invalid packaged catalog %j',
  (input) => expect(() => parseCatalogMessages(input)).toThrow('Invalid translation')
);
