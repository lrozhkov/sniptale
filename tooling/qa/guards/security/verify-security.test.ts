import { expect, it } from 'vitest';

import { collectSecurityViolations } from './verify-security.mjs';

it('accepts the declarative effect runtime without a Function-constructor exception', () => {
  expect(
    collectSecurityViolations(['apps/extension/src/effect-runtime-sandbox/worker/execute.ts'])
      .violations
  ).toEqual([]);
});

it('rejects direct and constructed Function calls in every owner', () => {
  const file = 'apps/extension/src/effect-runtime-sandbox/worker/execute.ts';
  const result = collectSecurityViolations([file], {
    readSource: () =>
      [
        'const first = Function("return 1");',
        'const second = new',
        '  /* forbidden constructor */ Function("return 2");',
      ].join('\n'),
  });

  expect(result.violations).toEqual([
    expect.objectContaining({ rule: 'security-function-constructor', file, line: 1 }),
    expect.objectContaining({ rule: 'security-function-constructor', file, line: 2 }),
  ]);
});

it('checks the verifier implementation for Function-constructor sinks', () => {
  const file = 'tooling/qa/guards/security/verify-security.mjs';
  const result = collectSecurityViolations([file], {
    readSource: () => 'export const execute = new /* forbidden */ Function("return 1");\n',
  });

  expect(result.violations).toContainEqual(
    expect.objectContaining({ rule: 'security-function-constructor', file })
  );
});
