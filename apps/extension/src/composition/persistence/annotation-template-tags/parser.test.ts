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
    value: { activeFilterTagIds: [], schemaVersion: 1, tags: [] },
  });
});

it('classifies structurally valid future schemas as unsafe', () => {
  const parsed = parseAnnotationTemplateTagState({
    schemaVersion: 2,
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
    tags: [{ id: 'one', label: 'Review' }],
  });
});
