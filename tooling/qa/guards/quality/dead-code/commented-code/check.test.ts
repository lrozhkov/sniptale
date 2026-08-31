import { expect, it } from 'vitest';

import { collectDeadCommentRuns } from './check.mjs';

const DEAD_CODE = ['const a = 1;', 'if (a) {', 'return a;', '}', 'function old() {', 'return 1;'];

it('blocks consecutive line-commented code', () => {
  expect(
    collectDeadCommentRuns(
      'apps/extension/src/example.ts',
      DEAD_CODE.map((line) => `// ${line}`)
    )
  ).toEqual([expect.objectContaining({ rule: 'dead-comment-block' })]);
});

it('blocks consecutive non-doc block-commented code', () => {
  expect(
    collectDeadCommentRuns('apps/extension/src/example.ts', [
      '/*',
      ...DEAD_CODE.map((line) => ` * ${line}`),
      ' */',
    ])
  ).toEqual([expect.objectContaining({ rule: 'dead-comment-block' })]);
});

it('allows prose, JSDoc, and runs below the configured threshold', () => {
  expect(
    collectDeadCommentRuns('apps/extension/src/example.ts', [
      '/**',
      ' * Returns the current item without executing legacy code.',
      ' */',
      '// const example = 1;',
      '// return example;',
    ])
  ).toEqual([]);
});
