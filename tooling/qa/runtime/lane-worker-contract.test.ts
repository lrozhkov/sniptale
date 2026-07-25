import { expect, it } from 'vitest';

import { parseLaneResult, parseQaWorkerEnvelope } from './lane-worker-contract.mjs';

it('rejects malformed worker envelopes before reading lane data', () => {
  expect(() => parseQaWorkerEnvelope({ ok: true }, 'failed')).toThrow(/field population/u);
  expect(() => parseQaWorkerEnvelope({ ok: 'yes', value: {} }, 'failed')).toThrow(/boolean ok/u);
});

it('rejects missing and malformed mode-specific lane results', () => {
  const shapes = { tests: { testSteps: 'steps' } };
  expect(() => parseLaneResult({}, { lane: 'tests', shapes })).toThrow(/field population/u);
  expect(() =>
    parseLaneResult(
      { testSteps: [{ label: 'Unit tests', status: 'unknown' }] },
      { lane: 'tests', shapes }
    )
  ).toThrow(/supported status/u);

  expect(() =>
    parseLaneResult(
      {
        testSteps: [
          {
            label: 'Unit tests',
            status: 'ok',
            violations: [{ file: 'src/example.ts', message: 'hidden failure' }],
          },
        ],
      },
      { lane: 'tests', shapes }
    )
  ).toThrow(/failure evidence with non-failed status/u);
});
