import { expect, it } from 'vitest';
import {
  cancelFullPageCaptureByExportRunId,
  registerFullPageExportRun,
  throwIfFullPageCaptureAborted,
} from './cancellation';

it('cancels only the matching active export run', () => {
  const run = registerFullPageExportRun('export-run-1');

  expect(cancelFullPageCaptureByExportRunId('export-run-stale')).toBe(false);
  expect(run.signal?.aborted).toBe(false);
  expect(cancelFullPageCaptureByExportRunId('export-run-1')).toBe(true);
  expect(() => throwIfFullPageCaptureAborted(run.signal)).toThrow('Full-page capture cancelled');
  run.release();
  expect(cancelFullPageCaptureByExportRunId('export-run-1')).toBe(false);
});

it('rejects duplicate ownership for the same export run', () => {
  const run = registerFullPageExportRun('export-run-duplicate');
  expect(() => registerFullPageExportRun('export-run-duplicate')).toThrow('already owns');
  run.release();
});

it('retains an early cancellation until the matching export run registers', () => {
  expect(cancelFullPageCaptureByExportRunId('export-run-early-cancel')).toBe(false);

  const run = registerFullPageExportRun('export-run-early-cancel');

  expect(run.signal.aborted).toBe(true);
  expect(() => throwIfFullPageCaptureAborted(run.signal)).toThrow('Full-page capture cancelled');
  expect(() => registerFullPageExportRun('export-run-early-cancel')).toThrow('already owns');
  run.release();
});

it('consumes an early cancellation only once', () => {
  cancelFullPageCaptureByExportRunId('export-run-consumed-cancel');
  const cancelledRun = registerFullPageExportRun('export-run-consumed-cancel');
  expect(cancelledRun.signal.aborted).toBe(true);
  cancelledRun.release();

  const laterRun = registerFullPageExportRun('export-run-consumed-cancel');
  expect(laterRun.signal.aborted).toBe(false);
  laterRun.release();
});

it('bounds early-cancellation tombstones and prunes the oldest entry first', () => {
  const exportRunIds = Array.from(
    { length: 257 },
    (_, index) => `export-run-bounded-cancel-${index}`
  );
  for (const exportRunId of exportRunIds) {
    expect(cancelFullPageCaptureByExportRunId(exportRunId)).toBe(false);
  }

  const oldestRun = registerFullPageExportRun(exportRunIds[0]);
  const newestRun = registerFullPageExportRun(exportRunIds.at(-1));

  expect(oldestRun.signal.aborted).toBe(false);
  expect(newestRun.signal.aborted).toBe(true);
  oldestRun.release();
  newestRun.release();
});

it('does not retain cancellation authority for an undefined export run', () => {
  const run = registerFullPageExportRun(undefined);
  expect(run.signal.aborted).toBe(false);
  run.release();
});
