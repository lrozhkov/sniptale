import { describe, expect, it } from 'vitest';

import {
  canonicalCatalogText,
  isI18nCatalogPath,
  parseCatalog,
  validateCatalogShape,
} from './i18n-catalog-format.mjs';

describe('canonical locale catalog format', () => {
  it('preserves semantic text and puts corresponding keys on identical physical lines', () => {
    const original = {
      group: { short: 'Done', long: 'x'.repeat(2000), escaped: 'first\nsecond\r\n"\\🙂 ' },
    };
    const source = parseCatalog(JSON.stringify(original));
    const translated = parseCatalog(
      JSON.stringify({
        group: { escaped: 'одна\nстрока', long: 'я'.repeat(3000), short: 'Готово' },
      })
    );
    const en = canonicalCatalogText(source.tree);
    const ru = canonicalCatalogText(translated.tree, source.tree);
    expect(JSON.parse(en)).toEqual(original);
    expect(JSON.parse(ru)).toEqual(translated.value);
    expect(en.split('\n')).toHaveLength(ru.split('\n').length);
    for (const key of ['short', 'long', 'escaped']) {
      expect(en.split('\n').findIndex((line) => line.includes(`"${key}":`))).toBe(
        ru.split('\n').findIndex((line) => line.includes(`"${key}":`))
      );
    }
    expect(en).toContain('first\\nsecond\\r\\n');
    expect(en).not.toContain('\r');
    expect(en.endsWith('\n')).toBe(true);
    expect(canonicalCatalogText(parseCatalog(en).tree)).toBe(en);
  });

  it('retains explicit numeric-property order instead of Object.keys ordering', () => {
    const source = parseCatalog('{"group":{"10":"ten","2":"two","a":"letter"}}');
    const translation = parseCatalog('{"group":{"2":"два","a":"буква","10":"десять"}}');
    const result = canonicalCatalogText(translation.tree, source.tree);
    expect(result.indexOf('"10"')).toBeLessThan(result.indexOf('"2"'));
    expect(result.indexOf('"2"')).toBeLessThan(result.indexOf('"a"'));
  });

  it.each([
    ['{"a":"x","a":"y"}', 'duplicate key a'],
    ['{"a":12}', 'object or string'],
    ['{"a":null}', 'object or string'],
    ['{"a":[]}', 'object or string'],
    ['{"a.b":"x"}', 'must not contain a dot'],
  ])('rejects ambiguous or non-message JSON: %s', (text, message) => {
    expect(() => parseCatalog(text)).toThrow(message);
  });

  it('checks recursive shape and substitution names, allowing empty strings and reordering', () => {
    const source = parseCatalog('{"group":{"copy":"{name}: {count}","empty":""}}');
    const valid = parseCatalog('{"group":{"empty":"","copy":"{count} — {name}"}}');
    expect(validateCatalogShape(valid.tree, source.tree)).toEqual([]);
    const invalid = parseCatalog('{"group":{"copy":"{name}"},"extra":"x"}');
    expect(validateCatalogShape(invalid.tree, source.tree)).toEqual([
      'catalog.json: group.copy has different substitution parameters',
      'catalog.json: missing key group.empty',
      'catalog.json: extra key extra',
    ]);
    expect(validateCatalogShape(parseCatalog('{"group":"x"}').tree, source.tree)).toContain(
      'catalog.json: group has a different object/string shape'
    );
  });

  it('restricts canonical handling to authored locale catalog JSON paths', () => {
    expect(isI18nCatalogPath('apps/extension/src/platform/i18n/catalogs/en.json')).toBe(true);
    expect(isI18nCatalogPath('apps/extension/src/platform/i18n/catalogs/pt-br.json')).toBe(true);
    expect(isI18nCatalogPath('apps/extension/src/platform/i18n/other.json')).toBe(false);
    expect(isI18nCatalogPath('other/catalogs/en.json')).toBe(false);
  });
});
