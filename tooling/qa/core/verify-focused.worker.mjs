import { assertPositiveInteger, parseLaneWorkerInput } from '../runtime/lane-worker-contract.mjs';
import { postQaLaneWorkerResult } from '../runtime/lane-worker-entry.mjs';
import { parseQualityBaseline } from './shared-baseline.mjs';
import {
  collectFocusedGraphLane,
  collectFocusedLightLane,
  collectFocusedLintLane,
  collectFocusedOwnerLane,
  collectFocusedTestLane,
  collectFocusedTypecheckLane,
} from './verify-focused.execution.mjs';

const FOCUSED_LANES = ['appOwners', 'targetPaths', 'typecheck', 'tests', 'lint', 'graph', 'light'];

export function parseFocusedWorkerInput(value) {
  const input = parseLaneWorkerInput(value, {
    contextBooleanFields: ['shouldRunManifestPermissions', 'shouldRunRuntimeTopology'],
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
      'shouldRunManifestPermissions',
      'shouldRunRuntimeTopology',
      'targetFiles',
    ],
    extraFields: ['typecheckMaxConcurrency'],
    label: 'Focused QA worker',
    lanes: FOCUSED_LANES,
  });
  assertPositiveInteger(input.typecheckMaxConcurrency, 'Focused QA worker typecheckMaxConcurrency');
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

export async function runFocusedLane({ context, lane, typecheckMaxConcurrency, vitestMaxWorkers }) {
  if (lane === 'appOwners' || lane === 'targetPaths') {
    return collectFocusedOwnerLane({ lane });
  }
  if (lane === 'light') return collectFocusedLightLane(context);
  if (lane === 'lint') return collectFocusedLintLane(context);
  if (lane === 'graph') return collectFocusedGraphLane(context);
  if (lane === 'typecheck') {
    return collectFocusedTypecheckLane(context, { maxConcurrency: typecheckMaxConcurrency });
  }
  if (lane === 'tests') {
    return collectFocusedTestLane(context, {
      maxWorkers: vitestMaxWorkers,
    });
  }
  throw new Error(`Unknown focused QA lane: ${lane}`);
}

await postQaLaneWorkerResult((input) => runFocusedLane(parseFocusedWorkerInput(input)));
