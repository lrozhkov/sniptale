import { describe, expect, it } from 'vitest';

import { containsCssFunction, containsUnsafeCssSyntax } from './css-safety';

describe('containsCssFunction', () => {
  it('finds direct, escaped, and comment-obfuscated CSS functions', () => {
    expect(containsCssFunction('fill: var(--remote);', 'var')).toBe(true);
    expect(containsCssFunction('fill: v\\61r(--remote);', 'var')).toBe(true);
    expect(containsCssFunction('fill: v/**/ar(--remote);', 'var')).toBe(true);
    expect(containsCssFunction('font-family: "/*", var(--remote-font), "*/";', 'var')).toBe(true);
    expect(containsCssFunction('font-family: "safe\\\"", var(--remote-font);', 'var')).toBe(true);
    expect(containsCssFunction('background-image: v\\61\r\nr(--remote-image);', 'var')).toBe(true);
  });

  it('ignores function-like text inside quoted CSS values', () => {
    expect(containsCssFunction('content: "var(--not-a-reference)";', 'var')).toBe(false);
  });
});

describe('containsUnsafeCssSyntax', () => {
  it.each(['\n', '\r', '\r\n', '\f'])(
    'resumes scanning after a bad CSS string terminated by %j',
    (lineBreak) => {
      const css = `.x { color: "broken${lineBreak}; background-image: url(https://attacker.example/pixel); }`;

      expect(containsUnsafeCssSyntax(css)).toBe(true);
    }
  );
});
