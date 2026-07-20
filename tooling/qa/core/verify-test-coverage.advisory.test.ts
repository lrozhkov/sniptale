import { expect, it } from 'vitest';

import {
  collectCoverageResidualReport,
  summarizeCoverageResidualReport,
} from './verify-test-coverage.advisory.mjs';

it('classifies helper residuals separately from public gaps', () => {
  const report = summarizeCoverageResidualReport([
    {
      file: 'apps/extension/src/content/parser/parsers/gwt/gwt-comments-froala.helpers.ts',
      category: 'helper-tail',
    },
    {
      file: 'apps/extension/src/content/content-runtime-bridge.ts',
      category: 'public-gap',
    },
    {
      file: 'apps/extension/src/content/parser/parsers/generic/form-fields.ts',
      category: 'likely-unreachable-tail',
    },
  ]);

  expect(report).toEqual(['helper-tail=1', 'likely-unreachable-tail=1', 'public-gap=1']);
});

it('returns an empty residual report when coverage json is missing', () => {
  expect(
    collectCoverageResidualReport({
      files: ['apps/extension/src/content/content-runtime-bridge.ts'],
      coverageReportPath: '.tmp/coverage/unit/does-not-exist.json',
    })
  ).toEqual([]);
});
