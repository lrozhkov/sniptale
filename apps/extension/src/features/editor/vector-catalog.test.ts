import { expect, it } from 'vitest';
import {
  catalogName,
  isCatalogCommand,
  isCatalogData,
  isCatalogResponse,
  isEditorVectorSourceToken,
} from './vector-catalog';
const source = { sourceId: 'https://example.test/api/', incarnation: 'source', generation: 2 };
it('preserves source-token text and generation boundaries after ownership moves', () => {
  for (const field of ['sourceId', 'incarnation']) {
    for (const text of [' ', 'a'.repeat(2048), `a${String.fromCharCode(127)}`, 'é♥\u2028'])
      expect(isEditorVectorSourceToken({ ...source, [field]: text })).toBe(true);
    for (const text of ['', 'a'.repeat(2049)])
      expect(isEditorVectorSourceToken({ ...source, [field]: text })).toBe(false);
    for (let code = 0; code < 32; code += 1)
      expect(
        isEditorVectorSourceToken({ ...source, [field]: `a${String.fromCharCode(code)}` })
      ).toBe(false);
  }
  for (const generation of [0, -0, Number.MAX_SAFE_INTEGER])
    expect(isEditorVectorSourceToken({ ...source, generation })).toBe(true);
  for (const generation of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1, Infinity, NaN, '1', null])
    expect(isEditorVectorSourceToken({ ...source, generation })).toBe(false);
});
it('preserves catalog name separators, ASCII grammar, and the 128-character boundary', () => {
  for (const name of ['a', '0', 'a0-b1', 'a'.repeat(128)]) expect(catalogName(name)).toBe(true);
  for (const name of [
    '',
    '-a',
    'a-',
    'a--b',
    'A',
    'a_b',
    'a:b',
    'a b',
    'é',
    'a\n',
    'a'.repeat(129),
  ])
    expect(catalogName(name)).toBe(false);
});
it('rejects C0 query controls while preserving printable text, DEL, and whitespace semantics', () => {
  const base = { requestId: 'request', source, operation: 'search' };
  for (let code = 0; code < 32; code += 1)
    expect(isCatalogCommand({ ...base, query: `a${String.fromCharCode(code)}b` })).toBe(false);
  for (const query of [' heart ', 'é♥', `a${String.fromCharCode(127)}b`, 'a'.repeat(256)])
    expect(isCatalogCommand({ ...base, query })).toBe(true);
  expect(isCatalogCommand({ ...base, query: '   ' })).toBe(false);
});
it('accepts bounded typed operation parameters and rejects unbounded or malformed requests', () => {
  const base = { requestId: 'request', source };
  expect(
    isCatalogCommand({ ...base, operation: 'search', query: 'heart', prefix: 'mdi', limit: 32 })
  ).toBe(true);
  for (const query of ['', 'x'.repeat(257), '\u0000secret'])
    expect(isCatalogCommand({ ...base, operation: 'search', query })).toBe(false);
  expect(
    isCatalogCommand({ ...base, operation: 'assets', prefix: '../escape', names: ['heart'] })
  ).toBe(false);
  expect(
    isCatalogCommand({
      ...base,
      operation: 'assets',
      prefix: 'mdi',
      names: Array(65).fill('heart'),
    })
  ).toBe(false);
  expect(isCatalogCommand({ ...base, operation: 'search', query: 'heart', limit: 1 })).toBe(false);
  expect(isCatalogCommand({ ...base, operation: 'unknown' })).toBe(false);
});
it('bounds every result shape while leaving SVG semantics to the explicit editor parser', () => {
  expect(
    isCatalogData('collections', {
      mdi: {
        name: 'Material Design',
        total: 7000,
        author: { name: 'Community' },
        license: { title: 'Apache', spdx: 'Apache-2.0' },
      },
    })
  ).toBe(true);
  expect(isCatalogData('search', { icons: ['mdi:heart'], limit: 32, start: 0, total: 1 })).toBe(
    true
  );
  expect(isCatalogData('search', { icons: ['../host'], limit: 32, start: 0 })).toBe(false);
  expect(isCatalogData('collection', { prefix: 'mdi', categories: { Shapes: ['heart'] } })).toBe(
    true
  );
  expect(isCatalogData('collection', { prefix: 'mdi', categories: { Shapes: [23] } })).toBe(false);
  expect(isCatalogData('assets', { prefix: 'mdi', icons: { heart: { body: '<path/>' } } })).toBe(
    true
  );
  expect(isCatalogResponse({ success: false, error: 'rate-limited', retryAfterSeconds: 30 })).toBe(
    true
  );
  expect(isCatalogResponse({ success: false, error: 'private response body' })).toBe(false);
});

it('accepts the recommended expanded search page and rejects results above 999', () => {
  const command = { requestId: 'request', source, operation: 'search', query: 'heart' };
  expect(isCatalogCommand({ ...command, limit: 999 })).toBe(true);
  expect(isCatalogCommand({ ...command, limit: 1000 })).toBe(false);
  const data = { icons: Array.from({ length: 999 }, () => 'mdi:heart'), limit: 999, start: 0 };
  expect(isCatalogData('search', data)).toBe(true);
  expect(isCatalogData('search', { ...data, limit: 1000 })).toBe(false);
  expect(isCatalogData('search', { ...data, icons: [...data.icons, 'mdi:heart'] })).toBe(false);
});
