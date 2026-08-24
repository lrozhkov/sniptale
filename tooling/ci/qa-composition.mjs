import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

import {
  createOkStep,
  createProcessStep,
  createSkippedStep,
} from '../qa/core/focused-qa-results.mjs';
import { collectAuditProfileResult } from '../qa/wrappers/audit.mjs';
import {
  collectFullVerifyStepResults,
  collectReleaseDeltaStepResults,
} from '../qa/core/verify-all.execution.mjs';
import { createReleaseControlOccurrences } from '../qa/core/qa-steps/release-occurrences.mjs';
import { resolveRepositoryVerifyScope } from '../qa/core/verify-all.scope.mjs';
import { runTimelineActivitySync } from '../qa/runtime/observability/timeline-context.mjs';
import { MUTATION_PROFILES, resolveMutationRunLabel } from './mutation-policy.mjs';

const semantics = JSON.parse(fs.readFileSync('tooling/configs/ci/proof-semantics.json', 'utf8'));

function capability(lane) {
  const value = semantics.gateCapabilities?.[lane];
  if (
    value?.scope !== 'repository-wide' ||
    (lane === 'proof' && (value.fullVitest !== false || value.releaseReady !== false)) ||
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
      includeTests: false,
      releaseMode: true,
      verifyScope: resolveCiScope(),
    }),
  auditCollector = collectAuditProfileResult,
} = {}) {
  capability('proof');
  const product = await productProofCollector();
  const productSteps = [
    ...product.steps,
    createSkippedStep('Unit tests', 'release-only full Vitest'),
    createSkippedStep('Test coverage', 'release-only canonical coverage'),
  ];
  const audit = await auditCollector({ profileId: 'pr', session });
  return {
    context: { mode: 'ci:proof', scope: 'commit' },
    steps: [...productSteps, ...audit.steps],
  };
}

function runMutationProfile(profile) {
  return runTimelineActivitySync(
    {
      activityId: `mutation-profile.${profile}`,
      kind: 'mutation-profile',
      executionProfile: {
        cpuTokens: 1,
        memoryMiB: null,
        workers: 1,
        pid: process.pid,
        workerId: `process-${process.pid}`,
      },
    },
    () => {
      const runner = process.env.SNIPTALE_TRUSTED_CI_ROOT
        ? '/opt/sniptale-trusted/tooling/test/mutation/run-profile.mjs'
        : 'tooling/test/mutation/run-profile.mjs';
      const result = spawnSync(process.execPath, [runner, profile, resolveMutationRunLabel()], {
        encoding: 'utf8',
        env: process.env,
      });
      return createProcessStep(`Mutation ${profile}`, result, {
        advice: `Inspect .tmp/mutation/${profile}/${process.env.GITHUB_RUN_ID ?? 'local'}/summary.json`,
      });
    }
  );
}

function resolveCiScope() {
  return runTimelineActivitySync({ activityId: 'scope-resolution', kind: 'scope-resolution' }, () =>
    resolveRepositoryVerifyScope()
  );
}

const RELEASE_DELTA_LABELS = new Set(['Unit tests', 'Test coverage', 'Build', 'Release archive']);
const REUSED_FAST_AUDIT_CONTROL_IDS = Object.freeze([
  'audit-evidence',
  'npm-audit',
  'npm-audit-signatures',
  'osv-scanner',
  'semgrep',
]);

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
    ...createReleaseControlOccurrences().map((occurrence) =>
      RELEASE_DELTA_LABELS.has(occurrence.label)
        ? byLabel.get(occurrence.label)
        : createReusedFastControlStep(occurrence)
    ),
  ];
}

export async function collectCiReleaseResults({
  session,
  reuseFastProof = false,
  productProofCollector = () =>
    collectFullVerifyStepResults({
      releaseMode: true,
      verifyScope: resolveCiScope(),
    }),
  releaseDeltaCollector = () =>
    collectReleaseDeltaStepResults({
      verifyScope: resolveCiScope(),
    }),
  auditCollector = collectAuditProfileResult,
  mutationCollector = runMutationProfile,
} = {}) {
  capability('release');
  const productSteps = reuseFastProof
    ? await collectVerifiedFastProofReleaseSteps(releaseDeltaCollector)
    : (await productProofCollector()).steps;
  const audit = await auditCollector({
    profileId: 'release',
    reusedControlIds: reuseFastProof ? REUSED_FAST_AUDIT_CONTROL_IDS : [],
    session,
  });
  return {
    context: { mode: 'ci:release', scope: 'commit' },
    executionMode: reuseFastProof ? 'reuse-fast-proof' : 'default',
    steps: [
      ...productSteps,
      ...audit.steps,
      ...MUTATION_PROFILES.map((profile) => mutationCollector(profile)),
    ],
  };
}

export { MUTATION_PROFILES };
