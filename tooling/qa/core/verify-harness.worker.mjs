import { parseLaneWorkerInput } from '../runtime/lane-worker-contract.mjs';
import { postQaLaneWorkerResult } from '../runtime/lane-worker-entry.mjs';
import { parseQualityBaseline } from './shared-baseline.mjs';
import {
  collectHarnessStaticLane,
  collectHarnessTestLane,
  collectHarnessTypecheckLane,
} from './verify-harness.execution.mjs';

const HARNESS_LANES = ['static', 'typecheck', 'tests'];

export function parseHarnessWorkerInput(value) {
  const input = parseLaneWorkerInput(value, {
    contextFields: [
      'baseline',
      'codeFiles',
      'existingTargetFiles',
      'harnessTargetFiles',
      'jsLikeFiles',
      'qualityCodeFiles',
      'qualityJsLikeFiles',
    ],
    contextStringArrayFields: [
      'codeFiles',
      'existingTargetFiles',
      'harnessTargetFiles',
      'jsLikeFiles',
      'qualityCodeFiles',
      'qualityJsLikeFiles',
    ],
    label: 'Harness QA worker',
    lanes: HARNESS_LANES,
  });
  return {
    ...input,
    context: {
      ...input.context,
      baseline: parseQualityBaseline(input.context.baseline),
    },
  };
}

export async function runHarnessLane({ context, lane, vitestMaxWorkers }) {
  if (lane === 'static') return collectHarnessStaticLane(context);
  if (lane === 'typecheck') return collectHarnessTypecheckLane(context);
  if (lane === 'tests') {
    return collectHarnessTestLane(context, { maxWorkers: vitestMaxWorkers });
  }
  throw new Error(`Unknown harness QA lane: ${lane}`);
}

await postQaLaneWorkerResult((input) => runHarnessLane(parseHarnessWorkerInput(input)));
