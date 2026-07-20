import { describe, expect, it, vi } from 'vitest';

import { awaitBestEffort, runBestEffort } from './index';

describe('best-effort helpers', () => {
  it('logs warning metadata for fire-and-forget failures', async () => {
    const logger = { warn: vi.fn() };

    runBestEffort(Promise.reject(new Error('transport failed')), logger, 'Best-effort failed', {
      phase: 'runtime',
    });
    await Promise.resolve();

    expect(logger.warn).toHaveBeenCalledWith(
      'Best-effort failed',
      { phase: 'runtime' },
      expect.any(Error)
    );
  });

  it('logs warning without metadata for awaited cleanup failures', async () => {
    const logger = { warn: vi.fn() };

    await awaitBestEffort(
      Promise.reject(new Error('cleanup failed')),
      logger,
      'Cleanup failed softly'
    );

    expect(logger.warn).toHaveBeenCalledWith('Cleanup failed softly', expect.any(Error));
  });
});
