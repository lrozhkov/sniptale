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

it('transfers raw structural findings separately from filtered gate violations', () => {
  const report = {
    advisories: [{ file: 'src/a.ts', id: 'watch' }],
    violations: [{ file: 'src/b.ts', id: 'allowed' }],
  };
  const result = parseLaneResult(
    { qualitySteps: [{ label: 'Structural risk', status: 'ok', structuralReport: report }] },
    { lane: 'light', shapes: { light: { qualitySteps: 'steps' } } }
  );
  expect(result.qualitySteps[0].structuralReport).toEqual(report);
  for (const structuralReport of [{}, { advisories: [], violations: ['invalid'] }]) {
    expect(() =>
      parseLaneResult(
        { qualitySteps: [{ label: 'Structural risk', status: 'ok', structuralReport }] },
        { lane: 'light', shapes: { light: { qualitySteps: 'steps' } } }
      )
    ).toThrow();
  }
});
