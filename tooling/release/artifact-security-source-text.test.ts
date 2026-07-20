import { expect, it } from 'vitest';

import {
  isIdentifierCharacter,
  isWhitespace,
  readIdentifierAt,
} from './artifact-security-source-text.mjs';

it('reads JavaScript identifier characters without consuming punctuation', () => {
  expect(readIdentifierAt('$alias_42()', 0)).toEqual({ end: 9, value: '$alias_42' });
  expect(readIdentifierAt('42alias', 0)).toBeNull();
  expect(isIdentifierCharacter('Z')).toBe(true);
  expect(isIdentifierCharacter('4')).toBe(true);
  expect(isIdentifierCharacter('-')).toBe(false);
});

it('recognizes only the whitespace accepted by release source scans', () => {
  expect([' ', '\n', '\r', '\t'].every(isWhitespace)).toBe(true);
  expect(isWhitespace('\f')).toBe(false);
});
