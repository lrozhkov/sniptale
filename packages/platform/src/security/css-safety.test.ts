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
  it.each([
    'background-image: src("https://attacker.example/pixel");',
    'background-image: image("https://attacker.example/pixel");',
    'background-image: s\\72 c("https://attacker.example/pixel");',
    'background-image: im/**/age("https://attacker.example/pixel");',
    'background-image: image-set("https://attacker.example/pixel" 1x);',
    'background-image: -webkit-image-set("https://attacker.example/pixel" 1x);',
    'background-image: var(--page-image);',
    'background-image: v\\61r(--page-image);',
  ])('rejects indirect resource-bearing syntax: %s', (css) => {
    expect(containsUnsafeCssSyntax(css)).toBe(true);
  });

  it.each(['\n', '\r', '\r\n', '\f'])(
    'resumes scanning after a bad CSS string terminated by %j',
    (lineBreak) => {
      const css = `.x { color: "broken${lineBreak}; background-image: url(https://attacker.example/pixel); }`;

      expect(containsUnsafeCssSyntax(css)).toBe(true);
    }
  );
});
