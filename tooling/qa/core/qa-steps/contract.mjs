import { FOCUSED_CODE_VIOLATION_STEPS } from '../verify-focused.code-steps.mjs';
import { FOCUSED_TRIGGERED_STEP_DEFINITIONS } from '../verify-focused-triggered.helpers.mjs';
import {
  ADVISORY_STEPS,
  AUDIT_STEPS,
  BUILD_COMMIT_STEPS,
  BUILD_STEPS,
  CANONICAL_WRAPPER_IDS,
  CLOSEOUT_STEPS,
  E2E_STEPS,
  FOCUSED_DIRECT_STEPS,
  HARNESS_STEPS,
  RELEASE_DIRECT_STEPS,
} from './definitions.data.mjs';
import { VERIFY_ALL_VIOLATION_STEPS } from '../verify-all.violation-steps.mjs';

export const QA_EXECUTION_CONTRACT_WRAPPERS = CANONICAL_WRAPPER_IDS;

function createNoTargetsStep() {
  return {
    label: 'No applicable targets',
    status: 'skipped',
    detail: 'no applicable targets',
  };
}

export function collectQaResultSteps(result) {
  const resultSteps = result.steps ?? [];
  const hasNoTargetsStep = resultSteps.some(({ label }) => label === 'No applicable targets');
  return [...resultSteps, ...(result.skipped && !hasNoTargetsStep ? [createNoTargetsStep()] : [])];
}

function tupleLabels(tuples) {
  return tuples.map(([, label]) => label);
}

function violationLabels(tuples) {
  return tuples.map(([label]) => label);
}

const CHECKPOINT_LABELS = [
  ...tupleLabels(FOCUSED_DIRECT_STEPS),
  ...violationLabels(FOCUSED_CODE_VIOLATION_STEPS),
  ...FOCUSED_TRIGGERED_STEP_DEFINITIONS.map(({ label }) => label),
  ...tupleLabels(ADVISORY_STEPS),
];
const RELEASE_LABELS = [
  ...tupleLabels(RELEASE_DIRECT_STEPS),
  ...violationLabels(VERIFY_ALL_VIOLATION_STEPS),
];

function buildContract(mode, hasFailure) {
  if (mode === 'proof') return { required: ['Build'] };
  if (mode === 'no-targets') return { required: ['QA build'] };
  if (mode === 'control-validate') return { required: ['QA build'] };
  if (mode === 'control-commit') {
    return hasFailure
      ? { required: ['Build'], optional: tupleLabels(BUILD_COMMIT_STEPS) }
      : { required: ['Build', ...tupleLabels(BUILD_COMMIT_STEPS)] };
  }
  if (mode === 'reuse-commit') {
    return hasFailure
      ? { required: ['Build'], optional: tupleLabels(BUILD_COMMIT_STEPS) }
      : { required: ['Build', ...tupleLabels(BUILD_COMMIT_STEPS)] };
  }
  if (mode === 'commit') {
    if (hasFailure) {
      return { required: tupleLabels(BUILD_STEPS), optional: tupleLabels(BUILD_COMMIT_STEPS) };
    }
    return { required: [...tupleLabels(BUILD_STEPS), ...tupleLabels(BUILD_COMMIT_STEPS)] };
  }
  return hasFailure
    ? { required: ['Naming'], optional: tupleLabels(BUILD_STEPS).slice(1) }
    : { required: tupleLabels(BUILD_STEPS) };
}

function checkpointContract(mode, hasFailure) {
  if (mode === 'no-targets') return { required: ['Format'] };
  if (mode === 'harness-only') return { required: ['Format', 'Harness QA'] };
  return hasFailure
    ? {
        required: ['Format'],
        optional: [...CHECKPOINT_LABELS.filter((label) => label !== 'Format'), 'Harness QA'],
      }
    : { required: CHECKPOINT_LABELS, optional: ['Harness QA'] };
}

function closeoutContract(mode, hasFailure) {
  if (mode.startsWith('reused-')) {
    return mode.endsWith('checkpoint-only')
      ? { required: ['QA checkpoint'] }
      : { required: tupleLabels(CLOSEOUT_STEPS) };
  }
  if (mode.includes('no-targets')) return { required: ['Format'] };
  if (mode.includes('harness-only')) {
    return {
      required: ['Format', 'Harness QA', ...(mode.endsWith('with-build') ? ['Full build'] : [])],
    };
  }
  return hasFailure
    ? {
        required: ['Format'],
        optional: [
          ...CHECKPOINT_LABELS.filter((label) => label !== 'Format'),
          'Harness QA',
          'Full build',
        ],
      }
    : {
        required: [...CHECKPOINT_LABELS, ...(mode.endsWith('with-build') ? ['Full build'] : [])],
        optional: ['Harness QA'],
      };
}

function resolveContract({ wrapperId, mode, hasFailure }) {
  if (mode === 'help') return { required: ['Wrapper help'] };
  if (wrapperId === 'qa:preflight') return { required: ['QA preflight'] };
  if (wrapperId === 'qa:advisory') return { required: tupleLabels(ADVISORY_STEPS) };
  if (wrapperId === 'qa:release-harness') {
    return mode === 'no-targets'
      ? { required: ['QA release harness'] }
      : { required: tupleLabels(HARNESS_STEPS) };
  }
  if (wrapperId === 'qa:checkpoint') return checkpointContract(mode, hasFailure);
  if (wrapperId === 'qa:build') return buildContract(mode, hasFailure);
  if (wrapperId === 'qa:closeout') return closeoutContract(mode, hasFailure);
  if (wrapperId === 'qa:release') return { required: RELEASE_LABELS };
  if (wrapperId === 'qa:audit') return { required: tupleLabels(AUDIT_STEPS) };
  if (wrapperId === 'qa:e2e') return { required: tupleLabels(E2E_STEPS) };
  throw new Error(`No QA execution contract for ${wrapperId}`);
}

function countLabels(labels) {
  const counts = new Map();
  for (const label of labels) counts.set(label, (counts.get(label) ?? 0) + 1);
  return counts;
}

/** Reject both emitted-but-unregistered and registered-but-unemitted wrapper steps. */
export function assertQaExecutionContract({ wrapperId, mode = 'default', steps, skipped = false }) {
  const hasFailure = steps.some((step) => step.status === 'failed');
  const contract = resolveContract({ wrapperId, mode, hasFailure });
  const required = [...contract.required, ...(skipped ? ['No applicable targets'] : [])];
  const actualCounts = countLabels(steps.map(({ label }) => label));
  const requiredCounts = countLabels(required);
  const optionalCounts = countLabels(contract.optional ?? []);
  const missing = required.filter(
    (label) => (actualCounts.get(label) ?? 0) < requiredCounts.get(label)
  );
  const unexpected = [...actualCounts].flatMap(([label, count]) => {
    const allowed = (requiredCounts.get(label) ?? 0) + (optionalCounts.get(label) ?? 0);
    return count > allowed ? Array(count - allowed).fill(label) : [];
  });
  if (missing.length > 0 || unexpected.length > 0) {
    const detail = [
      `missing=[${missing.join(', ')}]`,
      `unexpected=[${unexpected.join(', ')}]`,
    ].join(' ');
    throw new Error(`QA step contract drift for ${wrapperId}/${mode}: ${detail}`);
  }
}

export function assertQaResultContract({ wrapperId, result, mode = result.executionMode }) {
  const resolvedMode = mode ?? (result.skipped ? 'no-targets' : 'default');
  const steps = collectQaResultSteps(result);
  assertQaExecutionContract({
    wrapperId,
    mode: resolvedMode,
    steps,
    skipped: result.skipped ?? false,
  });
  return steps;
}
