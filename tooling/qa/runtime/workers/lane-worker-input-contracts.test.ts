import { expect, it } from 'vitest';

import { parseFullVerifyWorkerInput } from '../../composition/repository/full-verification/worker.mjs';
import { parseBuildWorkerInput } from '../../composition/build/scheduler-worker/worker.mjs';
import { parseFocusedWorkerInput } from '../../composition/checkpoint/focused/worker.mjs';

function focusedContext() {
  return {
    addedFiles: [],
    baseline: { allowances: [] },
    codeFiles: [],
    existingTargetFiles: [],
    jsLikeFiles: [],
    qualityCodeFiles: [],
    qualityJsLikeFiles: [],
    qualityTargetFiles: [],
    shouldRunFullOxlint: false,
    shouldRunManifestPermissions: false,
    shouldRunRuntimeTopology: false,
    targetFiles: [],
  };
}

it('accepts the execution-only Oxlint thread allocation in the full worker contract', () => {
  expect(
    parseFullVerifyWorkerInput({
      context: {
        baseline: { allowances: [] },
        codeFiles: [],
        excludedControlLabels: [],
        releaseMode: true,
        targetFiles: [],
      },
      lane: 'lint',
      oxlintThreadCount: 6,
      typecheckCheckerCount: 4,
      vitestMaxWorkers: 4,
    }).oxlintThreadCount
  ).toBe(6);
});

it('rejects malformed nested focused baseline allowances', () => {
  const context = {
    ...focusedContext(),
    baseline: {
      allowances: [
        {
          debtId: 'debt.example',
          file: 'src/example.ts',
          rule: 'example',
        },
      ],
    },
  };

  expect(() =>
    parseFocusedWorkerInput({
      context,
      lane: 'light',
      typecheckCheckerCount: 2,
      typecheckMaxConcurrency: 2,
      vitestMaxWorkers: 4,
    })
  ).toThrow(/exactly one of line or contentHash/u);
});

it('rejects omitted build-scope booleans instead of narrowing test proof', () => {
  expect(() =>
    parseBuildWorkerInput({
      buildScope: {
        staticScope: 'repo-wide',
        testScope: {
          detail: 'related tests',
          directTestFiles: [],
          relatedFiles: ['src/example.ts'],
          requireRelatedTests: true,
        },
      },
      context: { codeFiles: [], targetFiles: [] },
      lane: 'tests',
      typecheckCheckerCount: 4,
      vitestMaxWorkers: 4,
    })
  ).toThrow(/invalid field population/u);
});

it('rejects extra full-verification context authority', () => {
  expect(() =>
    parseFullVerifyWorkerInput({
      context: {
        baseline: { allowances: [] },
        codeFiles: [],
        excludedControlLabels: [],
        releaseMode: false,
        targetFiles: [],
        unexpectedAuthority: true,
      },
      lane: 'tests',
      oxlintThreadCount: 2,
      typecheckCheckerCount: 4,
      vitestMaxWorkers: 4,
    })
  ).toThrow(/invalid field population/u);
});
