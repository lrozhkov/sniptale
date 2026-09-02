import { expect, it } from 'vitest';

import { parseFullVerifyWorkerInput } from '../../composition/repository/full-verification/worker.mjs';
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
        structuralCodeFiles: ['src/current.ts'],
        structuralComparisonRevision: 'a'.repeat(40),
        structuralDeletedFiles: ['src/removed.ts'],
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
      rationales: [
        {
          id: 'noise.example',
          classification: 'tool-noise',
          owner: 'QA maintainers',
          reason: 'Test fixture for malformed exact finding identity.',
          removalCondition: 'Remove with the malformed fixture.',
        },
      ],
      allowances: [
        {
          noiseId: 'noise.example',
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

it('rejects extra full-verification context authority', () => {
  expect(() =>
    parseFullVerifyWorkerInput({
      context: {
        baseline: { allowances: [] },
        codeFiles: [],
        excludedControlLabels: [],
        releaseMode: false,
        structuralCodeFiles: [],
        structuralComparisonRevision: 'HEAD',
        structuralDeletedFiles: [],
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

it('rejects malformed structural comparison authority in the full worker contract', () => {
  expect(() =>
    parseFullVerifyWorkerInput({
      context: {
        baseline: { allowances: [] },
        codeFiles: [],
        excludedControlLabels: [],
        releaseMode: true,
        structuralCodeFiles: [],
        structuralComparisonRevision: 'main',
        structuralDeletedFiles: [],
        targetFiles: [],
      },
      lane: 'light',
      oxlintThreadCount: 2,
      typecheckCheckerCount: 4,
      vitestMaxWorkers: 4,
    })
  ).toThrow(/comparison revision/u);
});
