import { describe, expect, it } from 'vitest';

import {
  hasRuntimeCoverageRelevantChange,
  resolveCoverageTargetFiles,
} from './verify-test-coverage.mjs';

const FILE = 'apps/extension/src/editor/document/file-actions/index.ts';

function changedTargets(lines: number[]) {
  return {
    changedFiles: [FILE],
    changedLineMap: new Map([[FILE, new Set(lines)]]),
    untrackedFiles: new Set<string>(),
  };
}

describe('resolveCoverageTargetFiles coverage-neutral changes', () => {
  it('skips modified files whose changed lines are coverage-neutral topology glue', () => {
    expect(
      resolveCoverageTargetFiles({
        changedTargets: changedTargets([1, 2, 7]),
        files: [FILE],
        sourceReader: () =>
          [
            "import { value } from './new-owner';",
            "export type { Session } from './types';",
            '',
            'interface LocalState {',
            '  id: string;',
            '}',
            'type LocalToken = string;',
          ].join('\n'),
      })
    ).toEqual([]);
  });

  it('keeps modified files with behavior-bearing changed lines as coverage targets', () => {
    expect(
      resolveCoverageTargetFiles({
        changedTargets: changedTargets([3]),
        files: [FILE],
        sourceReader: () =>
          ["import { value } from './new-owner';", '', 'export const runtimeValue = value;'].join(
            '\n'
          ),
      })
    ).toEqual([FILE]);
  });

  it('skips tracked rename-only files without changed runtime lines', () => {
    expect(
      resolveCoverageTargetFiles({
        changedTargets: changedTargets([]),
        files: [FILE],
        sourceReader: () => 'export { value } from "./owner";',
      })
    ).toEqual([]);
  });
});

describe('hasRuntimeCoverageRelevantChange', () => {
  it('treats untracked files as runtime coverage relevant even when they are facades', () => {
    expect(
      hasRuntimeCoverageRelevantChange({
        changedLineNumbers: new Set([1]),
        isUntracked: true,
        relativePath: FILE,
        sourceText: "export { value } from './owner';",
      })
    ).toBe(true);
  });
});
