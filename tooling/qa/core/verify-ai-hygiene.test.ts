import { expect, it } from 'vitest';

import { collectDeadCommentRuns } from './ai-hygiene-utils.mjs';

it('keeps dead code comments as AI hygiene without file or model-budget signals', () => {
  const lines = [
    '// const a = 1;',
    '// if (a) {',
    '// return a;',
    '// }',
    '// function old() {',
    '// return 1;',
  ];
  expect(collectDeadCommentRuns('apps/extension/src/example.ts', lines)).toEqual([
    expect.objectContaining({ rule: 'dead-comment-block' }),
  ]);
});
