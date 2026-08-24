import { assertPositiveInteger, parseLaneWorkerInput } from '../runtime/lane-worker-contract.mjs';
import { postQaLaneWorkerResult } from '../runtime/lane-worker-entry.mjs';
import { parseQualityBaseline } from './shared-baseline.mjs';
import { collectFullVerifyLane } from './verify-all.execution.mjs';

const FULL_VERIFY_LANES = [
  'appOwners',
  'targetPaths',
  'typecheck',
  'tests',
  'lint',
  'graph',
  'light',
];

export function parseFullVerifyWorkerInput(value) {
  const input = parseLaneWorkerInput(value, {
    contextBooleanFields: ['releaseMode'],
    contextFields: ['baseline', 'codeFiles', 'excludedControlLabels', 'releaseMode', 'targetFiles'],
    contextStringArrayFields: ['codeFiles', 'excludedControlLabels', 'targetFiles'],
    extraFields: ['oxlintThreadCount', 'typecheckCheckerCount'],
    label: 'Full verification worker',
    lanes: FULL_VERIFY_LANES,
  });
  assertPositiveInteger(input.typecheckCheckerCount, 'Full verification worker checker count');
  assertPositiveInteger(input.oxlintThreadCount, 'Full verification worker Oxlint thread count');
  return {
    ...input,
    context: {
      ...input.context,
      baseline: parseQualityBaseline(input.context.baseline),
    },
  };
}

await postQaLaneWorkerResult((input) => collectFullVerifyLane(parseFullVerifyWorkerInput(input)));
