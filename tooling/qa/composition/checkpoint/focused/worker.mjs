import {
  assertPositiveInteger,
  parseLaneWorkerInput,
} from '../../../runtime/workers/lane-worker-contract.mjs';
import { postQaLaneWorkerResult } from '../../../runtime/workers/lane-worker-entry.mjs';
import { parseQualityBaseline } from '../../../policy/baselines/shared-baseline.mjs';
import {
  collectFocusedGraphLane,
  collectFocusedLightLane,
  collectFocusedLintLane,
  collectFocusedOwnerLane,
  collectFocusedTestLane,
  collectFocusedTypecheckLane,
} from './execution.mjs';

const FOCUSED_LANES = ['appOwners', 'targetPaths', 'typecheck', 'tests', 'lint', 'graph', 'light'];

export function parseFocusedWorkerInput(value) {
  const input = parseLaneWorkerInput(value, {
    contextBooleanFields: [
      'shouldRunFullOxlint',
      'shouldRunManifestPermissions',
      'shouldRunRuntimeTopology',
    ],
    contextStringArrayFields: [
      'addedFiles',
      'codeFiles',
      'existingTargetFiles',
      'jsLikeFiles',
      'qualityCodeFiles',
      'qualityJsLikeFiles',
      'qualityTargetFiles',
      'targetFiles',
    ],
    contextFields: [
      'addedFiles',
      'baseline',
      'codeFiles',
      'existingTargetFiles',
      'jsLikeFiles',
      'qualityCodeFiles',
      'qualityJsLikeFiles',
      'qualityTargetFiles',
      'shouldRunFullOxlint',
      'shouldRunManifestPermissions',
      'shouldRunRuntimeTopology',
      'targetFiles',
    ],
    extraFields: ['typecheckCheckerCount', 'typecheckMaxConcurrency'],
    label: 'Focused QA worker',
    lanes: FOCUSED_LANES,
  });
  assertPositiveInteger(input.typecheckMaxConcurrency, 'Focused QA worker typecheckMaxConcurrency');
  assertPositiveInteger(input.typecheckCheckerCount, 'Focused QA worker typecheckCheckerCount');
  if (input.typecheckMaxConcurrency > 2) {
    throw new Error('Focused QA worker typecheckMaxConcurrency cannot exceed 2.');
  }
  return {
    ...input,
    context: {
      ...input.context,
      baseline: parseQualityBaseline(input.context.baseline),
    },
  };
}

export async function runFocusedLane({
  context,
  lane,
  typecheckCheckerCount,
  typecheckMaxConcurrency,
  vitestMaxWorkers,
}) {
  if (lane === 'appOwners' || lane === 'targetPaths') {
    return collectFocusedOwnerLane({ lane });
  }
  if (lane === 'light') return collectFocusedLightLane(context);
  if (lane === 'lint') return collectFocusedLintLane(context);
  if (lane === 'graph') return collectFocusedGraphLane(context);
  if (lane === 'typecheck') {
    return collectFocusedTypecheckLane(context, {
      checkerCount: typecheckCheckerCount,
      maxConcurrency: typecheckMaxConcurrency,
    });
  }
  if (lane === 'tests') {
    return collectFocusedTestLane(context, {
      maxWorkers: vitestMaxWorkers,
    });
  }
  throw new Error(`Unknown focused QA lane: ${lane}`);
}

await postQaLaneWorkerResult((input) => runFocusedLane(parseFocusedWorkerInput(input)));
