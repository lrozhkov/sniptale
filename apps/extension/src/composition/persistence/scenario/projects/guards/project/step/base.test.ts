import { expect, it, vi } from 'vitest';

import { parseStepBase, parseTone } from './base';

it('parses step base fields with legacy fallbacks', () => {
  vi.spyOn(Date, 'now').mockReturnValue(500);

  expect(
    parseStepBase(
      {
        id: undefined,
        title: 1,
        body: undefined,
        createdAt: 'now',
        updatedAt: undefined,
      } as Record<string, unknown>,
      0
    )
  ).toEqual({
    id: 'scenario-step-1',
    title: '',
    body: '',
    createdAt: 500,
    updatedAt: 500,
  });
});

it('normalizes note tone values', () => {
  expect(parseTone('warning')).toBe('warning');
  expect(parseTone('unexpected')).toBe('neutral');
});

it('keeps explicit base fields when they are already valid', () => {
  expect(
    parseStepBase(
      {
        id: 'step-1',
        title: 'Title',
        body: 'Body',
        createdAt: 11,
        updatedAt: 12,
      } as Record<string, unknown>,
      0
    )
  ).toEqual({
    id: 'step-1',
    title: 'Title',
    body: 'Body',
    createdAt: 11,
    updatedAt: 12,
  });
});
