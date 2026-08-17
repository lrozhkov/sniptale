import { expect, it } from 'vitest';

import { createTempRoot } from '../core/test-helpers';
import { violationsToSarif } from './canonical-sarif.mjs';

it('sanitizes bounded SARIF diagnostics and requires repository-relative locations', () => {
  const root = createTempRoot('canonical-sarif-');
  const sarif = violationsToSarif({
    toolName: 'Semgrep',
    informationUri: 'https://semgrep.dev/',
    root,
    violations: [
      { rule: 'rule.one', file: 'src/example.ts', line: 7, message: `found at ${root}/secret` },
    ],
  });
  expect(sarif.runs[0].results[0]).toMatchObject({
    ruleId: 'rule.one',
    message: { text: 'found at <repo>/secret' },
    locations: [
      {
        physicalLocation: {
          artifactLocation: { uri: 'src/example.ts' },
          region: { startLine: 7 },
        },
      },
    ],
  });
  expect(() =>
    violationsToSarif({
      toolName: 'CodeQL',
      informationUri: 'https://codeql.github.com/',
      root,
      violations: [{ rule: 'rule', file: `${root}/secret.ts`, line: 1, message: 'unsafe' }],
    })
  ).toThrow('unsafe repository path');
});
