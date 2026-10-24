import { parse } from 'postcss';
import { expect, it } from 'vitest';
import { enableShadowPropertyDefaults } from './shadow-properties';

it('retains canonical property defaults and removes only their direct browser condition', () => {
  const declarations = '--tw-border-style:solid;--tw-shadow:0 0 #0000;--tw-ring-shadow:0 0 #0000';
  const source = `@layer properties{@supports (browser:fallback){*,::before,::after{${declarations}}}}@property --tw-border-style{syntax:"*";inherits:false;initial-value:solid}`;
  const result = enableShadowPropertyDefaults(source);
  expect(result).toContain(`*,::before,::after{${declarations}}`);
  expect(result).toContain(
    '@property --tw-border-style{syntax:"*";inherits:false;initial-value:solid}'
  );
  const rules: string[] = [];
  parse(result).walkAtRules('supports', (rule) => {
    rules.push(rule.params);
  });
  expect(rules).toEqual([]);
});

it('preserves unrelated conditions, nesting, and utility declarations', () => {
  const unrelated =
    '@layer utilities{@supports (display:grid){.grid{display:grid}}}@supports (color:red){.other{color:red}}';
  const nested = '@supports (feature:nested){.nested{--x:1}}';
  const source = `@layer properties{@supports (browser:fallback){*{--tw-border-style:solid}${nested}}}${unrelated}`;
  const result = enableShadowPropertyDefaults(source);
  expect(result).toContain(unrelated);
  expect(result).toContain(nested);
  expect(result).not.toContain('(browser:fallback)');
});

it('fails the build if a dependency update removes the expected generated defaults', () => {
  expect(() => enableShadowPropertyDefaults('.border{border-width:1px}')).toThrow(
    'must include Tailwind property fallbacks'
  );
});
