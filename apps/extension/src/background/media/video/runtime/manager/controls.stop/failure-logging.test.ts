import { expect, it, vi } from 'vitest';

import { resolveStopFailureLogger } from './failure-logging';

it('preserves the detailed logger outside privacy erasure', () => {
  const logger = { warn: vi.fn() };

  expect(resolveStopFailureLogger('detailed', logger)).toBe(logger);
});

it('drops errors and metadata from fixed privacy-erasure warnings', () => {
  const logger = { warn: vi.fn() };
  const fixedLogger = resolveStopFailureLogger('fixed', logger);

  fixedLogger.warn(
    'Recording stop cleanup failed',
    { recordingId: 'recording-1' },
    new Error('raw')
  );
  fixedLogger.warn({ recordingId: 'recording-2' });

  expect(logger.warn).toHaveBeenNthCalledWith(1, 'Recording stop cleanup failed');
  expect(logger.warn).toHaveBeenNthCalledWith(2, 'Recording stop cleanup failed');
  expect(JSON.stringify(logger.warn.mock.calls)).not.toContain('recording-');
  expect(JSON.stringify(logger.warn.mock.calls)).not.toContain('raw');
});
