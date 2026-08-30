import {
  assertPositiveInteger,
  assertRecord,
  assertStringArray,
  parseLaneWorkerInput,
} from '../../../runtime/workers/lane-worker-contract.mjs';
import { postQaLaneWorkerResult } from '../../../runtime/workers/lane-worker-entry.mjs';
import { collectBuildLane } from '../execution/check.mjs';

const BUILD_LANES = ['typecheck', 'tests', 'security', 'graph', 'static'];

export function parseBuildWorkerInput(value) {
  const input = parseLaneWorkerInput(value, {
    contextFields: ['codeFiles', 'targetFiles'],
    contextStringArrayFields: ['codeFiles', 'targetFiles'],
    extraFields: ['buildScope', 'typecheckCheckerCount'],
    label: 'Build QA worker',
    lanes: BUILD_LANES,
  });
  assertPositiveInteger(input.typecheckCheckerCount, 'Build QA worker checker count');
  const buildScope = assertRecord(input.buildScope, 'Build QA worker buildScope');
  if (
    JSON.stringify(Object.keys(buildScope).sort()) !== JSON.stringify(['staticScope', 'testScope'])
  ) {
    throw new Error('Build QA worker buildScope has an invalid field population.');
  }
  if (buildScope.staticScope !== 'repo-wide') {
    throw new Error('Build QA worker buildScope.staticScope must be repo-wide.');
  }
  const testScope = assertRecord(buildScope.testScope, 'Build QA worker buildScope.testScope');
  if (
    JSON.stringify(Object.keys(testScope).sort()) !==
    JSON.stringify(
      ['detail', 'directTestFiles', 'fullSuite', 'relatedFiles', 'requireRelatedTests'].sort()
    )
  ) {
    throw new Error('Build QA worker buildScope.testScope has an invalid field population.');
  }
  if (typeof testScope.detail !== 'string') {
    throw new Error('Build QA worker buildScope.testScope.detail must be a string.');
  }
  assertStringArray(
    testScope.directTestFiles,
    'Build QA worker buildScope.testScope.directTestFiles'
  );
  assertStringArray(testScope.relatedFiles, 'Build QA worker buildScope.testScope.relatedFiles');
  for (const field of ['fullSuite', 'requireRelatedTests']) {
    if (typeof testScope[field] !== 'boolean') {
      throw new Error(`Build QA worker buildScope.testScope.${field} must be a boolean.`);
    }
  }
  return {
    ...input,
    buildScope: {
      staticScope: buildScope.staticScope,
      testScope: {
        detail: testScope.detail,
        directTestFiles: [...testScope.directTestFiles],
        fullSuite: testScope.fullSuite,
        relatedFiles: [...testScope.relatedFiles],
        requireRelatedTests: testScope.requireRelatedTests,
      },
    },
    context: {
      codeFiles: [...input.context.codeFiles],
      targetFiles: [...input.context.targetFiles],
    },
  };
}

await postQaLaneWorkerResult((input) => collectBuildLane(parseBuildWorkerInput(input)));
