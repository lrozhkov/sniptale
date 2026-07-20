import { describe, expect, it } from 'vitest';
import { createRetryableModuleLoader } from './retryable-module-loader';

describe('createRetryableModuleLoader', () => {
  it('retries the module load after an initial failure', async () => {
    let attempts = 0;
    const loader = createRetryableModuleLoader(async () => {
      attempts += 1;

      if (attempts === 1) {
        throw new Error('chunk failed');
      }

      return 'loaded';
    });

    await expect(loader.load()).rejects.toThrow('chunk failed');
    await expect(loader.load()).resolves.toBe('loaded');
    expect(loader.getLoaded()).toBe('loaded');
    expect(attempts).toBe(2);
  });
});
