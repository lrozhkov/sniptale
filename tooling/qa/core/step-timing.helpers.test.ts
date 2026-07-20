import { expect, it } from 'vitest';

import {
  formatStepDetail,
  formatStepSummary,
  timeSyncStep,
  withStepDuration,
} from './step-timing.helpers.mjs';

it('formats step detail with duration appended', () => {
  expect(formatStepDetail('no matching files', 0)).toBe('no matching files; 0ms');
  expect(formatStepDetail('', 1500)).toBe('1.5s');
});

it('formats failed step summaries with duration', () => {
  expect(formatStepSummary('failed', 1500)).toBe('failed (1.5s)');
});

it('attaches duration metadata to step results', () => {
  expect(withStepDuration({ label: 'ESLint', status: 'ok' }, 12)).toEqual({
    label: 'ESLint',
    status: 'ok',
    durationMs: 12,
  });

  const step = timeSyncStep(() => ({
    label: 'Naming',
    status: 'ok',
  }));

  expect(step.label).toBe('Naming');
  expect(step.status).toBe('ok');
  expect(step.durationMs).toBeTypeOf('number');
  expect(step.durationMs).toBeGreaterThanOrEqual(0);
});
