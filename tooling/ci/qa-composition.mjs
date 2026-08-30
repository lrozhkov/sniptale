import fs from 'node:fs';

import {
  createOkStep,
  createProcessStep,
} from '../qa/composition/checkpoint/focused-qa-results.mjs';
import { collectAuditProfileResult } from '../qa/wrappers/audit.mjs';
import {
  collectFullVerifyStepResults,
  collectReleaseDeltaStepResults,
} from '../qa/composition/repository/full-verification/execution.mjs';
import { resolveRepositoryVerifyScope } from '../qa/composition/repository/full-verification/scope.mjs';
import { runTimelineActivitySync } from '../qa/runtime/observability/timeline-context.mjs';
import { runNpm } from '../qa/runtime/process/shared-process.mjs';
import {
  ciExcludedControlLabels,
  createCiProductControlOccurrences,
} from './product-control-policy.mjs';

const semantics = JSON.parse(fs.readFileSync('tooling/configs/ci/proof-semantics.json', 'utf8'));

function capability(lane) {
  const value = semantics.gateCapabilities?.[lane];
  if (
    value?.scope !== 'repository-wide' ||
    (lane === 'proof' && (value.fullVitest !== true || value.releaseReady !== false)) ||
    (lane === 'release' && (value.fullVitest !== true || value.releaseReady !== true))
  ) {
    throw new Error(`Malformed ${lane} gate capability policy.`);
  }
  return value;
}

export async function collectCiProofResults({
  session,
  productProofCollector = () =>
    collectFullVerifyStepResults({
      includeArtifactSteps: false,
      includeTests: true,
      releaseMode: true,
      excludedControlLabels: ciExcludedControlLabels('proof'),
      verifyScope: resolveCiScope(),
    }),
  auditCollector = collectAuditProfileResult,
  productionBuildCollector = collectFreshProductionBuildStep,
} = {}) {
  capability('proof');
  const product = await productProofCollector();
  const productSteps = product.steps.filter(({ label }) => label !== 'Test coverage');
  const audit = await auditCollector({ profileId: 'pr', session });
  const productionBuild = productionBuildCollector();
  return {
    context: { mode: 'ci:proof', scope: 'commit' },
    steps: [...productSteps, productionBuild, ...audit.steps],
  };
}

export function collectFreshProductionBuildStep({ commandRunner = runNpm } = {}) {
  return runTimelineActivitySync(
    {
      activityId: 'production-build',
      kind: 'build',
      executionProfile: {
        cpuTokens: 1,
        memoryMiB: null,
        workers: 1,
        pid: process.pid,
        workerId: `process-${process.pid}`,
      },
    },
    () => createProcessStep('Production build', commandRunner(['run', 'build:release']))
  );
}

function resolveCiScope() {
  return runTimelineActivitySync({ activityId: 'scope-resolution', kind: 'scope-resolution' }, () =>
    resolveRepositoryVerifyScope()
  );
}

const RELEASE_DELTA_LABELS = new Set(['SonarJS', 'Build', 'Release archive']);
const FRESH_RELEASE_AUDIT_REUSED_CONTROL_IDS = Object.freeze(['npm-audit']);
const REUSED_FAST_AUDIT_CONTROL_IDS = Object.freeze([]);

function createReusedFastControlStep({ id, label }) {
  return runTimelineActivitySync(
    { activityId: `fast-proof-reuse.${id}`, kind: 'proof-reuse', reused: true },
    () => createOkStep(label, 'reused verified exact commit-bound Fast proof')
  );
}

async function collectVerifiedFastProofReleaseSteps(releaseDeltaCollector) {
  const delta = await releaseDeltaCollector();
  const byLabel = new Map();
  for (const step of delta.steps ?? []) {
    if (!RELEASE_DELTA_LABELS.has(step.label) || byLabel.has(step.label)) {
      throw new Error(`Malformed release-only control result: ${String(step.label)}`);
    }
    byLabel.set(step.label, step);
  }
  for (const label of RELEASE_DELTA_LABELS) {
    if (!byLabel.has(label)) throw new Error(`Missing release-only control result: ${label}`);
  }
  return [
    runTimelineActivitySync(
      { activityId: 'fast-proof-reuse', kind: 'proof-reuse', reused: true },
      () => createOkStep('Fast proof reuse', 'verified exact commit-bound proof receipt')
    ),
    ...createCiProductControlOccurrences('release').map((occurrence) =>
      RELEASE_DELTA_LABELS.has(occurrence.label)
        ? byLabel.get(occurrence.label)
        : createReusedFastControlStep(occurrence)
    ),
  ];
}

async function collectFreshFastProofReleaseSteps(productProofCollector, releaseDeltaCollector) {
  const fast = await productProofCollector();
  const delta = await releaseDeltaCollector();
  const byLabel = new Map();
  for (const step of [...fast.steps, ...delta.steps]) {
    if (byLabel.has(step.label) && !RELEASE_DELTA_LABELS.has(step.label)) {
      throw new Error(`Fresh Fast prerequisite repeats a control result: ${String(step.label)}`);
    }
    byLabel.set(step.label, step);
  }
  const occurrences = [
    ...createCiProductControlOccurrences('proof'),
    ...createCiProductControlOccurrences('release').filter(
      ({ label }) =>
        !createCiProductControlOccurrences('proof').some((step) => step.label === label)
    ),
  ];
  return occurrences.map(({ label }) => {
    const step = byLabel.get(label);
    if (!step) throw new Error(`Missing release product control result: ${label}`);
    return step;
  });
}

export async function collectCiReleaseResults({
  session,
  reuseFastProof = false,
  scopeResolver = resolveCiScope,
  productProofCollector = (verifyScope) =>
    collectFullVerifyStepResults({
      includeArtifactSteps: false,
      releaseMode: true,
      excludedControlLabels: ciExcludedControlLabels('proof'),
      verifyScope,
    }),
  releaseDeltaCollector = (verifyScope, { includeArtifactSteps }) =>
    collectReleaseDeltaStepResults({
      excludedControlLabels: ciExcludedControlLabels('release'),
      includeArtifactSteps,
      verifyScope,
    }),
  auditCollector = collectAuditProfileResult,
  productionBuildCollector = collectFreshProductionBuildStep,
} = {}) {
  capability('release');
  const verifyScope = scopeResolver();
  const collectProductProof = () => productProofCollector(verifyScope);
  const collectReleaseDelta = (includeArtifactSteps) => () =>
    releaseDeltaCollector(verifyScope, { includeArtifactSteps });
  const productSteps = reuseFastProof
    ? await collectVerifiedFastProofReleaseSteps(collectReleaseDelta(true))
    : await collectFreshFastProofReleaseSteps(collectProductProof, collectReleaseDelta(true));
  const productionBuild = reuseFastProof
    ? createReusedFastControlStep({ id: 'qa.rule.production-build', label: 'Production build' })
    : productionBuildCollector();
  const audit = await auditCollector({
    profileId: 'release',
    reusedControlIds: reuseFastProof
      ? REUSED_FAST_AUDIT_CONTROL_IDS
      : FRESH_RELEASE_AUDIT_REUSED_CONTROL_IDS,
    session,
  });
  return {
    context: { mode: 'ci:release', scope: 'commit' },
    executionMode: reuseFastProof ? 'reuse-fast-proof' : 'fresh-fast-proof',
    steps: [...productSteps, productionBuild, ...audit.steps],
  };
}
