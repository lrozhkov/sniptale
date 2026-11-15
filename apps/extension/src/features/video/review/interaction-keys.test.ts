import { expect, it } from 'vitest';
import { REVIEW_KEY_CATALOG, reviewChordKeys, reviewChordLabel } from './interaction-keys';

it('offers Cmd and Windows keys independently of the host platform', () => {
  const values = REVIEW_KEY_CATALOG.map((key) => key.value);
  expect(values).toContain('Cmd');
  expect(values).toContain('Win');
  expect(values).toContain('Option');
  expect(new Set(values).size).toBe(values.length);
  expect(reviewChordLabel(['Cmd', 'Shift', 'K'])).toBe('Cmd+Shift+K');
});

it('preserves explicit keys and parses recorded aliases and the plus key', () => {
  expect(reviewChordKeys('Control+K')).toEqual(['Ctrl', 'K']);
  expect(reviewChordKeys('Command+K')).toEqual(['Cmd', 'K']);
  expect(reviewChordKeys('Ctrl++')).toEqual(['Ctrl', 'Plus']);
  const keys = ['Win', 'Plus'];
  const parsed = reviewChordKeys('ignored', keys);
  expect(parsed).toEqual(keys);
  expect(parsed).not.toBe(keys);
});
