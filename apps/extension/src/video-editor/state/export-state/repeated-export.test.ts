import { expect, it } from 'vitest';

import {
  completeExportState,
  createInitialExportState,
  failExportState,
  startExportState,
} from '.';

const firstResult = {
  exportId: 'export-1',
  filename: 'first.webm',
  recordingId: 'recording-1',
};

it('starts a fresh export after failure and after a prior completion', () => {
  const afterFailure = failExportState(
    startExportState(createInitialExportState(), 'job-1'),
    'render failed'
  );
  const retry = startExportState(afterFailure, 'job-2');

  expect(retry).toMatchObject({ error: null, isRunning: true, jobId: 'job-2' });

  const repeated = startExportState(completeExportState(retry, firstResult), 'job-3');
  expect(repeated).toMatchObject({
    error: null,
    isRunning: true,
    jobId: 'job-3',
    lastResult: null,
  });
});
