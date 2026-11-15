type CatalogMessages = Readonly<Record<string, string>>;

/** Check packaged message data before it enters the synchronous translator. */
export function parseCatalogMessages(value: unknown): CatalogMessages {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid translation catalog');
  }
  const entries = Object.entries(value);
  if (
    entries.some(
      ([key, message]) =>
        !key.includes('.') ||
        key.split('.').some((part) => ['__proto__', 'prototype', 'constructor'].includes(part)) ||
        typeof message !== 'string'
    )
  ) {
    throw new Error('Invalid translation catalog message');
  }
  const messages: Record<string, string> = {};
  for (const [key, message] of entries) {
    if (typeof message === 'string') messages[key] = message;
  }
  return Object.freeze(messages);
}

/** Prepare selected data eagerly, then read translations without asynchronous work. */
export function createCatalogStore<TLocale extends string, TScope extends string>(options: {
  fallbackLocale: TLocale;
  load: (locale: TLocale, scope: TScope) => Promise<unknown>;
}) {
  const catalogs = new Map<TLocale, Map<TScope, CatalogMessages>>();
  const flights = new Map<string, Promise<void>>();

  function prepareScope(locale: TLocale, scope: TScope): Promise<void> {
    if (catalogs.get(locale)?.has(scope)) return Promise.resolve();
    const identity = JSON.stringify([locale, scope]);
    const pending = flights.get(identity);
    if (pending) return pending;
    const flight = Promise.resolve()
      .then(() => options.load(locale, scope))
      .then(parseCatalogMessages)
      .then((messages) => {
        let scopes = catalogs.get(locale);
        if (!scopes) {
          scopes = new Map();
          catalogs.set(locale, scopes);
        }
        scopes.set(scope, messages);
      })
      .finally(() => flights.delete(identity));
    flights.set(identity, flight);
    return flight;
  }

  function find(locale: TLocale, key: string): string | undefined {
    for (const messages of catalogs.get(locale)?.values() ?? []) {
      if (Object.hasOwn(messages, key)) return messages[key];
    }
    return undefined;
  }

  return {
    async prepare(locale: TLocale, scopes: readonly TScope[]): Promise<void> {
      const locales = new Set([options.fallbackLocale, locale]);
      await Promise.all(
        [...locales].flatMap((selected) =>
          [...new Set(scopes)].map((scope) => prepareScope(selected, scope))
        )
      );
    },
    read(locale: TLocale, key: string): string {
      return find(locale, key) ?? find(options.fallbackLocale, key) ?? key;
    },
    has(locale: TLocale, key: string): boolean {
      return find(locale, key) !== undefined || find(options.fallbackLocale, key) !== undefined;
    },
  };
}
