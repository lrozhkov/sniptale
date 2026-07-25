import { expect, it } from 'vitest';

import { parseFullVerifyWorkerInput } from './verify-all.worker.mjs';
import { parseBuildWorkerInput } from './verify-build.worker.mjs';
import { parseFocusedWorkerInput } from './verify-focused.worker.mjs';

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
    shouldRunManifestPermissions: false,
    shouldRunRuntimeTopology: false,
    targetFiles: [],
  };
}

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
        releaseMode: false,
        targetFiles: [],
        unexpectedAuthority: true,
      },
      lane: 'tests',
      vitestMaxWorkers: 4,
    })
  ).toThrow(/invalid field population/u);
});
