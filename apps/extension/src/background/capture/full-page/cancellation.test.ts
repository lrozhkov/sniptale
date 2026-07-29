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
