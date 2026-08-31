import { expect, it } from 'vitest';

import { collectHtmlSanitizerOwnershipViolations } from './check.mjs';

function collect(file: string, source: string) {
  return collectHtmlSanitizerOwnershipViolations([file], { readSource: () => source }).violations;
}

it.each([['element.innerHTML = raw;'], ["element['innerHTML'] = raw;"]])(
  'blocks direct HTML assignment outside the canonical owner',
  (source) => {
    expect(collect('apps/extension/src/example.ts', source)).toEqual([
      expect.objectContaining({ rule: 'security-inner-html-owner' }),
    ]);
  }
);

it('accepts the current canonical sanitizer provenance', () => {
  const source = [
    'export function sanitizeHtmlFragment(html) { return purifier.sanitize(html); }',
    'export function write(element, html) {',
    '  const sanitizedHtml = sanitizeHtmlFragment(html);',
    '  element.innerHTML = sanitizedHtml;',
    '}',
  ].join('\n');
  expect(collect('packages/platform/src/security/sanitizers/html.ts', source)).toEqual([]);
});

it.each([
  ['export function sanitizeHtmlFragment(html) { return html; }\nelement.innerHTML = html;'],
  [
    'function sanitizeHtmlFragment(html) { return html; }\nelement.innerHTML = sanitizeHtmlFragment(html);',
  ],
  ['export function sanitizeHtmlFragment(html) { return html; }\nelement.innerHTML = clean(html);'],
])('rejects raw, shadowed, or unrelated sanitizer use in the canonical file', (source) => {
  expect(collect('packages/platform/src/security/sanitizers/html.ts', source)).toEqual([
    expect.objectContaining({ rule: 'security-inner-html-owner' }),
  ]);
});

it('ignores comments and strings that only mention the sink', () => {
  expect(
    collect(
      'apps/extension/src/example.ts',
      'const note = "element.innerHTML = raw"; // innerHTML\n'
    )
  ).toEqual([]);
});

it('fails closed for malformed source', () => {
  expect(() => collect('apps/extension/src/broken.ts', 'export const broken = ;')).toThrow(
    /Cannot analyze malformed source/u
  );
});
