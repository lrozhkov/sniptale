// @vitest-environment jsdom

import { expect, it } from 'vitest';

import { buildScenarioTargetSemanticFields } from './target-semantics';

it('builds normalized target semantics', () => {
  const target = document.createElement('button');
  target.setAttribute('aria-label', '  Open   details ');
  target.setAttribute('role', 'switch');
  target.setAttribute('title', '  Detailed   title ');
  target.textContent = '  A   very long label ';

  expect(buildScenarioTargetSemanticFields(target, { ellipsis: '...' })).toEqual({
    ariaLabel: 'Open details',
    role: 'switch',
    tagName: 'button',
    text: 'A very long label',
    title: 'Detailed title',
  });
});

it.each([
  ['…' as const, `${'x'.repeat(119)}…`],
  ['...' as const, `${'x'.repeat(117)}...`],
])('keeps the 120-character invariant with %s', (ellipsis, truncated) => {
  const target = document.createElement('div');
  target.textContent = 'x'.repeat(120);
  expect(buildScenarioTargetSemanticFields(target, { ellipsis }).text).toBe('x'.repeat(120));

  target.textContent = 'x'.repeat(121);
  expect(buildScenarioTargetSemanticFields(target, { ellipsis }).text).toBe(truncated);
  expect(truncated).toHaveLength(120);
});
