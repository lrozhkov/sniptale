import { FOCUSED_TRIGGERED_STEP_DEFINITIONS } from '../checkpoint/focused-triggered/helpers.mjs';
import {
  ADVISORY_STEPS,
  AUDIT_STEPS,
  BUILD_COMMIT_STEPS,
  BUILD_STEPS,
  CANONICAL_WRAPPER_IDS,
  CI_COMPOSITION_STEPS,
  CLOSEOUT_STEPS,
  E2E_STEPS,
  FOCUSED_DIRECT_STEPS,
  HARNESS_STEPS,
  STRUCTURAL_AUDIT_STEPS,
} from './definitions.data.mjs';
import { FOCUSED_CODE_VIOLATION_LABELS } from './catalog.data.mjs';
import { createCiProductControlOccurrences } from '../../../ci/product-control-policy.mjs';

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

const CHECKPOINT_LABELS = [
  ...tupleLabels(FOCUSED_DIRECT_STEPS),
  ...FOCUSED_CODE_VIOLATION_LABELS,
  'Messaging',
  ...FOCUSED_TRIGGERED_STEP_DEFINITIONS.map(({ label }) => label),
  ...tupleLabels(ADVISORY_STEPS),
];
const CI_PROOF_LABELS = createCiProductControlOccurrences('proof').map(({ label }) => label);
const CI_RELEASE_LABELS = createCiProductControlOccurrences('release').map(({ label }) => label);
const AUDIT_LABELS = tupleLabels(AUDIT_STEPS);
const CI_GATE_LABELS = tupleLabels(CI_COMPOSITION_STEPS).filter(
  (label) => label === 'Production build'
);

function ciProofContract() {
  return { required: [...CI_PROOF_LABELS, ...CI_GATE_LABELS, ...AUDIT_LABELS] };
}

function ciReleaseContract(mode) {
  const proofLabels =
    mode === 'reuse-fast-proof'
      ? ['Fast proof reuse', ...CI_RELEASE_LABELS]
      : [
          ...CI_PROOF_LABELS,
          ...CI_RELEASE_LABELS.filter((label) => !CI_PROOF_LABELS.includes(label)),
        ];
  return { required: [...proofLabels, ...CI_GATE_LABELS, ...AUDIT_LABELS] };
}

function buildContract(mode, hasFailure) {
  if (mode === 'proof') return { required: ['Build'] };
  if (mode === 'no-targets') return { required: ['QA build'] };
  if (mode === 'control-validate') return { required: ['QA build'] };
  if (mode === 'control-commit') {
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

function resolveContract({ wrapperId, mode, hasFailure, formatBarrierFailure }) {
  if (mode === 'help') return { required: ['Wrapper help'] };
  if (wrapperId === 'qa:preflight') return { required: ['QA preflight'] };
  if (wrapperId === 'qa:advisory') return { required: tupleLabels(ADVISORY_STEPS) };
  if (wrapperId === 'qa:structural-audit') {
    return { required: tupleLabels(STRUCTURAL_AUDIT_STEPS) };
  }
  if (wrapperId === 'qa:release-harness') {
    if (mode === 'no-targets') return { required: ['QA release harness'] };
    const labels = tupleLabels(HARNESS_STEPS);
    return formatBarrierFailure
      ? { required: ['Format'], optional: labels.filter((label) => label !== 'Format') }
      : { required: labels };
  }
  if (wrapperId === 'qa:checkpoint') return checkpointContract(mode, hasFailure);
  if (wrapperId === 'qa:build') return buildContract(mode, hasFailure);
  if (wrapperId === 'qa:closeout') return closeoutContract(mode, hasFailure);
  if (wrapperId === 'ci:proof') return ciProofContract();
  if (wrapperId === 'ci:release') return ciReleaseContract(mode);
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
  const formatBarrierFailure =
    wrapperId === 'qa:release-harness' &&
    steps.length === 1 &&
    steps[0]?.label === 'Format' &&
    steps[0]?.status === 'failed';
  const contract = resolveContract({ wrapperId, mode, hasFailure, formatBarrierFailure });
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
