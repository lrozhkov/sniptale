import { assertPositiveInteger, parseLaneWorkerInput } from '../runtime/lane-worker-contract.mjs';
import { postQaLaneWorkerResult } from '../runtime/lane-worker-entry.mjs';
import { parseQualityBaseline } from './shared-baseline.mjs';
import {
  collectHarnessStaticLane,
  collectHarnessOxlintLane,
  collectHarnessTestLane,
  collectHarnessTypecheckLane,
} from './verify-harness.execution.mjs';

const HARNESS_LANES = ['static', 'typecheck', 'oxlint', 'tests'];

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
    extraFields: ['typecheckCheckerCount'],
    label: 'Harness QA worker',
    lanes: HARNESS_LANES,
  });
  assertPositiveInteger(input.typecheckCheckerCount, 'Harness QA worker checker count');
  return {
    ...input,
    context: {
      ...input.context,
      baseline: parseQualityBaseline(input.context.baseline),
    },
  };
}

export async function runHarnessLane({ context, lane, typecheckCheckerCount, vitestMaxWorkers }) {
  if (lane === 'static') return collectHarnessStaticLane(context);
  if (lane === 'typecheck') {
    return collectHarnessTypecheckLane(context, { checkerCount: typecheckCheckerCount });
  }
  if (lane === 'oxlint') return collectHarnessOxlintLane(context);
  if (lane === 'tests') {
    return collectHarnessTestLane(context, { maxWorkers: vitestMaxWorkers });
  }
  throw new Error(`Unknown harness QA lane: ${lane}`);
}

await postQaLaneWorkerResult((input) => runHarnessLane(parseHarnessWorkerInput(input)));
