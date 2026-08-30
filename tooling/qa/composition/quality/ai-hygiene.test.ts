import { expect, it, vi } from 'vitest';

vi.mock('../../analysis/repository/shared-paths.mjs', async (importOriginal) => ({
  ...(await importOriginal()),
  readText: vi.fn(() =>
    [
      '// const legacy = 1;',
      '// if (legacy) {',
      '// return legacy;',
      '// }',
      '// function old() {',
      '// return 1;',
    ].join('\n')
  ),
}));

import { collectAiHygieneReport } from './ai-hygiene.mjs';

it('keeps one logical result while preserving both analyzer identities', () => {
  expect(collectAiHygieneReport(['apps/extension/src/example.ts']).violations).toEqual([
    expect.objectContaining({ rule: 'dead-comment-block' }),
  ]);
});
