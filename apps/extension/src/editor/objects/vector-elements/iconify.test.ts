// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { parseEditorIconifySet, prepareEditorIconifyDefinition } from './iconify';

const body = '<path d="M1 2H9V6H1Z" fill="currentColor"/>';

it('uses 16px defaults, per-icon dimensions, and immutable attribution without fetching', async () => {
  const set = parseEditorIconifySet({
    prefix: 'test',
    icons: { base: { body }, wide: { body, width: 32, height: 8 } },
    info: {
      name: 'Local shapes',
      author: { name: 'Author', url: 'https://example.com' },
      license: { title: 'MIT', url: 'https://example.com/license' },
    },
  });
  const definition = await prepareEditorIconifyDefinition(set, 'base', 'local-import');
  expect(definition.viewBox).toEqual({ minX: 0, minY: 0, width: 16, height: 16 });
  expect(definition.provenance).toEqual({
    sourceId: 'local-import',
    prefix: 'test',
    name: 'base',
    author: 'Author',
    authorUrl: 'https://example.com',
    license: 'MIT',
    licenseUrl: 'https://example.com/license',
  });
  expect((await prepareEditorIconifyDefinition(set, 'wide', 'local-import')).viewBox).toEqual({
    minX: 0,
    minY: 0,
    width: 32,
    height: 8,
  });
  expect(Object.isFrozen(set.data.icons['base'])).toBe(true);
  expect(Object.isFrozen(set.data.icons)).toBe(true);
});

it('combines alias chains with additive rotations and cancelling flips', async () => {
  const set = parseEditorIconifySet({
    prefix: 'test',
    width: 30,
    height: 10,
    icons: { base: { body, hFlip: true, rotate: 1 } },
    aliases: {
      first: { parent: 'base', hFlip: true, rotate: 3 },
      second: { parent: 'first' },
    },
  });
  const actual = await prepareEditorIconifyDefinition(set, 'second', 'local');
  const plain = await prepareEditorIconifyDefinition(
    parseEditorIconifySet({ prefix: 'test', width: 30, height: 10, icons: { base: { body } } }),
    'base',
    'local'
  );
  expect(actual.svg).toBe(plain.svg);
  expect(actual.viewBox).toEqual(plain.viewBox);
});

it.each([1, 3])(
  'swaps non-square viewBox dimensions and origins for quarter rotation %s',
  async (rotate) => {
    const set = parseEditorIconifySet({
      prefix: 'test',
      width: 30,
      height: 10,
      left: -5,
      top: 2,
      icons: { base: { body } },
      aliases: { turned: { parent: 'base', rotate } },
    });
    const definition = await prepareEditorIconifyDefinition(set, 'turned', 'local');
    expect(definition.viewBox).toEqual({ minX: 2, minY: -5, width: 10, height: 30 });
    expect(definition.svg).toContain('transform=');
  }
);

it('retains alias dimension overrides and materializes both flips as a half turn', async () => {
  const set = parseEditorIconifySet({
    prefix: 'test',
    width: 30,
    height: 10,
    icons: { base: { body } },
    aliases: {
      flipped: { parent: 'base', width: 40, height: 20, hFlip: true, vFlip: true },
      rotated: { parent: 'base', width: 40, height: 20, rotate: 2 },
    },
  });
  const flipped = await prepareEditorIconifyDefinition(set, 'flipped', 'local');
  const rotated = await prepareEditorIconifyDefinition(set, 'rotated', 'local');
  expect(flipped.viewBox).toEqual({ minX: 0, minY: 0, width: 40, height: 20 });
  expect(flipped.svg).toBe(rotated.svg);
});

it('excludes hidden icons from grids but resolves them and deduplicates visible categories', async () => {
  const set = parseEditorIconifySet({
    prefix: 'test',
    icons: { visible: { body }, secret: { body, hidden: true } },
    aliases: { shown: { parent: 'secret', hidden: false } },
    categories: { Shapes: ['visible', 'visible', 'secret', 'shown', 'missing'] },
  });
  expect(set.names).toEqual(['visible', 'shown']);
  expect(set.categories['Shapes']).toEqual(['visible', 'shown']);
  expect((await prepareEditorIconifyDefinition(set, 'secret', 'local')).provenance.name).toBe(
    'secret'
  );
});

it('reports invalid aliases without losing valid siblings and bounds alias depth', async () => {
  const aliases: Record<string, { parent: string }> = {
    cycle: { parent: 'cycle-two' },
    'cycle-two': { parent: 'cycle' },
    absent: { parent: 'missing' },
  };
  for (let index = 0; index < 42; index++)
    aliases[`deep-${index}`] = { parent: index === 41 ? 'base' : `deep-${index + 1}` };
  const set = parseEditorIconifySet({ prefix: 'test', icons: { base: { body } }, aliases });
  expect(set.names).toContain('base');
  expect(set.names).not.toContain('cycle');
  expect(set.issues).toContainEqual({ name: 'absent', code: 'invalid-alias' });
  expect(set.issues).toContainEqual({ name: 'deep-0', code: 'invalid-alias' });
  await expect(prepareEditorIconifyDefinition(set, 'cycle', 'local')).rejects.toMatchObject({
    code: 'invalid-alias',
  });
  await expect(prepareEditorIconifyDefinition(set, 'missing', 'local')).rejects.toMatchObject({
    code: 'missing-icon',
  });
});

it('never resolves prototype names as icon bodies or alias parents', async () => {
  const set = parseEditorIconifySet(
    JSON.parse(
      JSON.stringify({
        prefix: 'test',
        icons: { base: { body } },
        aliases: { constructor: { parent: 'base' }, broken: { parent: 'toString' } },
      })
    )
  );
  expect(set.names).toEqual(['base', 'constructor']);
  expect((await prepareEditorIconifyDefinition(set, 'constructor', 'local')).slots).toHaveLength(1);
  await expect(prepareEditorIconifyDefinition(set, 'toString', 'local')).rejects.toMatchObject({
    code: 'missing-icon',
  });
});

it.each([
  '<script>alert(1)</script>',
  '<path onload="alert(1)" d="M0 0L1 1"/>',
  '<image href="https://example.com/private.png"/>',
  '<path d="M0 0L1 1" fill="url(https://example.com/private.svg)"/>',
  '<defs><linearGradient id="paint"/></defs><rect width="5" height="5" fill="url(#paint)"/>',
])('applies the same strict SVG admission to untrusted Iconify bodies: %s', async (unsafeBody) => {
  const set = parseEditorIconifySet({
    prefix: 'test',
    icons: { safe: { body }, unsafe: { body: unsafeBody } },
  });
  await expect(prepareEditorIconifyDefinition(set, 'unsafe', 'local')).rejects.toThrow();
  expect((await prepareEditorIconifyDefinition(set, 'safe', 'local')).slots).toHaveLength(1);
});

it('rejects invalid root dimensions and records per-icon failures without silent fallback', () => {
  expect(() =>
    parseEditorIconifySet({ prefix: 'test', width: 0, icons: { base: { body } } })
  ).toThrow();
  const set = parseEditorIconifySet({
    prefix: 'test',
    icons: {
      base: { body },
      invalid: { body, width: '24' },
      oversized: { body: ' '.repeat(2097153) },
    },
  });
  expect(set.names).toEqual(['base']);
  expect(set.issues).toEqual([
    { name: 'invalid', code: 'invalid-collection' },
    { name: 'oversized', code: 'budget-exceeded' },
  ]);
});

it('rejects excessive name inventories and malformed metadata before preparing any definition', () => {
  const icons = Object.fromEntries(
    Array.from({ length: 20001 }, (_, index) => [`icon-${index}`, { body }])
  );
  expect(() => parseEditorIconifySet({ prefix: 'test', icons })).toThrow('budget-exceeded');
  expect(() =>
    parseEditorIconifySet({
      prefix: 'test',
      icons: { base: { body } },
      info: { author: { name: 'invalid\nmetadata' } },
    })
  ).toThrow('invalid-collection');
});

it('counts icons and aliases together before per-row admission', () => {
  const aliases = Object.fromEntries(
    Array.from({ length: 20000 }, (_, index) => [`alias-${index}`, { parent: 'base' }])
  );
  expect(() =>
    parseEditorIconifySet({ prefix: 'test', icons: { base: { body } }, aliases })
  ).toThrow('budget-exceeded');
  delete aliases['alias-19999'];
  expect(
    parseEditorIconifySet({ prefix: 'test', icons: { base: { body } }, aliases }).names
  ).toHaveLength(20000);
});

it.each([null, 'aliases'].map((aliases) => ({ aliases })))(
  'refuses malformed aliases containers before admitting rows: %s',
  ({ aliases }) => {
    expect(() =>
      parseEditorIconifySet({ prefix: 'test', icons: { base: { body } }, aliases })
    ).toThrow('invalid-collection');
  }
);

it('preserves partial diagnostics and immutable rows in admission order', () => {
  const set = parseEditorIconifySet({
    prefix: 'test',
    icons: { bad: { body, width: 0 }, base: { body } },
    aliases: {
      malformed: { parent: '--bad' },
      invalid: { parent: 'base', hFlip: 'true' },
      missing: { parent: 'absent' },
      valid: { parent: 'base' },
    },
    categories: { visible: ['base', 'valid'] },
  });
  expect(set.names).toEqual(['base', 'valid']);
  expect(set.issues).toEqual([
    { name: 'bad', code: 'invalid-collection' },
    { name: 'malformed', code: 'invalid-alias' },
    { name: 'invalid', code: 'invalid-collection' },
    { name: 'missing', code: 'invalid-alias' },
  ]);
  for (const value of [
    set,
    set.data,
    set.data.aliases,
    set.data.aliases?.['valid'],
    set.names,
    set.categories,
    set.categories['visible'],
    set.issues,
    ...set.issues,
  ])
    expect(Object.isFrozen(value)).toBe(true);
  expect(Object.getPrototypeOf(set.data.icons)).toBeNull();
  expect(Object.getPrototypeOf(set.data.aliases)).toBeNull();
  expect(Object.getPrototypeOf(set.categories)).toBeNull();
});

it('counts category references before filtering and across categories', () => {
  const missing = Array.from({ length: 50000 }, () => 'missing');
  const input = {
    prefix: 'test',
    icons: { base: { body } },
    categories: { first: missing, second: missing },
  };
  expect(parseEditorIconifySet(input).categories).toEqual({ first: [], second: [] });
  expect(() =>
    parseEditorIconifySet({ ...input, categories: { ...input.categories, extra: ['base'] } })
  ).toThrow('budget-exceeded');
});

it('bounds category count before inspecting category entries', () => {
  const categories = Object.fromEntries(
    Array.from({ length: 256 }, (_, index) => [`category-${index}`, []])
  );
  const input = { prefix: 'test', icons: { base: { body } }, categories };
  expect(Object.keys(parseEditorIconifySet(input).categories)).toHaveLength(256);
  expect(() =>
    parseEditorIconifySet({ ...input, categories: { ...categories, extra: 'invalid' } })
  ).toThrow('invalid-collection');
});

it.each(
  [null, { '': [] }, { ['x'.repeat(257)]: [] }, { valid: 'base' }].map((categories) => ({
    categories,
  }))
)('refuses invalid category containers and rows: %s', ({ categories }) => {
  expect(() =>
    parseEditorIconifySet({ prefix: 'test', icons: { base: { body } }, categories })
  ).toThrow('invalid-collection');
});

it('keeps envelope, root-property and category refusal precedence', () => {
  expect(() =>
    parseEditorIconifySet({ prefix: 'test', width: 0, icons: { base: { body } }, aliases: null })
  ).toThrow('invalid-collection');
  expect(() =>
    parseEditorIconifySet({
      prefix: 'test',
      icons: { base: { body } },
      categories: { all: Array.from({ length: 100001 }, () => 'missing') },
      info: { name: '\n' },
    })
  ).toThrow('budget-exceeded');
});

it('preserves empty array containers admitted by the shared record predicate', () => {
  const set = parseEditorIconifySet({
    prefix: 'test',
    icons: { base: { body } },
    aliases: [],
    categories: [],
  });
  expect(set.names).toEqual(['base']);
  expect(set.categories).toEqual({});
});
