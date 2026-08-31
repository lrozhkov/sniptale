import { expect, it, vi } from 'vitest';

import { collectViolationSteps } from './violation-steps.mjs';

it('awaits asynchronous violation runners before creating release steps', async () => {
  const runner = vi.fn(async () => ({ skipped: false, files: [], violations: [] }));

  await expect(
    collectViolationSteps(
      {
        codeFiles: [],
        releaseMode: true,
        targetFiles: [],
      },
      [['Async policy', 'Async policy violations found:', runner]]
    )
  ).resolves.toEqual([
    expect.objectContaining({
      label: 'Async policy',
      status: 'ok',
    }),
  ]);
  expect(runner).toHaveBeenCalledWith({ astGrepReceipt: null, scope: 'repo-wide' });
});
