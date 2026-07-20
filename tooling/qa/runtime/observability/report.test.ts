import { expect, it } from 'vitest';

import { createTempRoot } from '../../core/test-helpers';
import { collectQaStatisticsReport, parseQaStatisticsArguments } from './report.mjs';

it('provides strict help and filtering arguments', () => {
  expect(parseQaStatisticsArguments(['--wrapper', 'qa:checkpoint']).values).toEqual({
    wrapperId: 'qa:checkpoint',
  });
  expect(parseQaStatisticsArguments(['--help']).help).toContain('Usage: npm run qa:stats');
  expect(() => parseQaStatisticsArguments(['--typo'])).toThrow(/Unknown argument/u);
});

it('returns an empty structured report without fabricating legacy runs', () => {
  const root = createTempRoot('qa-statistics-report-');
  expect(collectQaStatisticsReport({ rootDir: root, wrapperId: 'qa:checkpoint' })).toMatchObject({
    invalidRecordCount: 0,
    wrappers: [],
    legacySuccessfulDurationFallback: null,
  });
});
