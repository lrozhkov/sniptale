import { expect, it } from 'vitest';

import {
  isUnsafeAnnotationTemplateTagState,
  normalizeAnnotationTemplateTagLabel,
  parseAnnotationTemplateTagState,
} from './parser';

it('normalizes whitespace and Unicode labels without writing migration state', () => {
  expect(normalizeAnnotationTemplateTagLabel('  Cafe\u0301   review  ')).toBe('Café review');
  expect(parseAnnotationTemplateTagState(undefined)).toEqual({
    hasInvalidRoot: false,
    invalidFieldCount: 0,
    sourceSchemaVersion: 2,
    value: {
      activeFilterTagIds: [
        'system-tag-sniptale',
        'system-tag-paper',
        'system-tag-neon',
        'system-tag-editorial',
        'system-tag-retro-80s',
      ],
      schemaVersion: 2,
      tags: expect.arrayContaining([
        expect.objectContaining({ id: 'system-tag-sniptale', origin: 'system' }),
        expect.objectContaining({ id: 'system-tag-paper', origin: 'system' }),
        expect.objectContaining({ id: 'system-tag-neon', origin: 'system' }),
        expect.objectContaining({ id: 'system-tag-editorial', origin: 'system' }),
        expect.objectContaining({ id: 'system-tag-retro-80s', origin: 'system' }),
      ]),
    },
  });
});

it('preserves an explicit filter while refreshing and adding system themes', () => {
  const stale = parseAnnotationTemplateTagState({
    activeFilterTagIds: [],
    schemaVersion: 2,
    tags: [
      {
        basedOnRevision: 1,
        customized: false,
        id: 'system-tag-sniptale',
        label: 'Sniptale',
        origin: 'system',
        systemTagKey: 'sniptale',
      },
    ],
  });
  expect(stale.value.activeFilterTagIds).toEqual([]);

  expect(parseAnnotationTemplateTagState(stale.value).value.activeFilterTagIds).toEqual(
    stale.value.activeFilterTagIds
  );
  expect(
    parseAnnotationTemplateTagState({ ...stale.value, activeFilterTagIds: [] }).value
      .activeFilterTagIds
  ).toEqual([]);
});

it('classifies structurally valid future schemas as unsafe', () => {
  const parsed = parseAnnotationTemplateTagState({
    schemaVersion: 3,
    tags: [{ id: 'one', label: 'Review' }],
    activeFilterTagIds: [],
  });
  expect(parsed.invalidFieldCount).toBe(0);
  expect(isUnsafeAnnotationTemplateTagState(parsed)).toBe(true);
});

it('rejects duplicate labels and drops unknown active filters', () => {
  const parsed = parseAnnotationTemplateTagState({
    schemaVersion: 1,
    tags: [
      { id: 'one', label: 'Review' },
      { id: 'two', label: ' review ' },
    ],
    activeFilterTagIds: ['one', 'missing'],
  });
  expect(parsed.invalidFieldCount).toBe(2);
  expect(parsed.value).toMatchObject({
    activeFilterTagIds: ['one'],
  });
  expect(parsed.value.tags).toEqual(
    expect.arrayContaining([expect.objectContaining({ id: 'one', label: 'Review' })])
  );
});

it('activates canonical system tags only when the filter field is uninitialized', () => {
  const parsed = parseAnnotationTemplateTagState({ schemaVersion: 2, tags: [] });

  expect(parsed.value.activeFilterTagIds).toEqual([
    'system-tag-sniptale',
    'system-tag-paper',
    'system-tag-neon',
    'system-tag-editorial',
    'system-tag-retro-80s',
  ]);
});

it('preserves a legacy user tag that collides with a newly reserved theme label', () => {
  const parsed = parseAnnotationTemplateTagState({
    schemaVersion: 1,
    tags: [{ id: 'legacy-sniptale', label: 'Sniptale' }],
    activeFilterTagIds: ['legacy-sniptale'],
  });
  expect(isUnsafeAnnotationTemplateTagState(parsed)).toBe(false);
  expect(parsed.value.tags).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: 'system-tag-sniptale', label: 'Sniptale' }),
      expect.objectContaining({ id: 'legacy-sniptale', label: 'Sniptale (user)' }),
    ])
  );
});
