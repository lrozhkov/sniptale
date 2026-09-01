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

import { collectDeadCommentedCodeViolations } from './dead-commented-code.mjs';

it('reports dead commented code without mixing in readability heuristics', () => {
  expect(collectDeadCommentedCodeViolations(['apps/extension/src/example.ts'])).toEqual([
    expect.objectContaining({ rule: 'dead-comment-block' }),
  ]);
});
