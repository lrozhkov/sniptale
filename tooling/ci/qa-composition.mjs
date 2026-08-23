import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

import { createProcessStep, createSkippedStep } from '../qa/core/focused-qa-results.mjs';
import { collectAuditProfileResult } from '../qa/wrappers/audit.mjs';
import { collectFullVerifyStepResults } from '../qa/core/verify-all.execution.mjs';
import { resolveRepositoryVerifyScope } from '../qa/core/verify-all.scope.mjs';

const MUTATION_PROFILES = Object.freeze(['persistence', 'secrets']);
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

function hasFailure(steps) {
  return steps.some(({ status }) => status === 'failed');
}

export async function collectCiProofResults({
  session,
  productProofCollector = () =>
    collectFullVerifyStepResults({
      includeTests: false,
      releaseMode: true,
      verifyScope: resolveRepositoryVerifyScope(),
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
  if (hasFailure(productSteps)) {
    return {
      context: { mode: 'ci:proof', scope: 'commit' },
      steps: productSteps,
    };
  }
  const audit = await auditCollector({ profileId: 'pr', session });
  return {
    context: { mode: 'ci:proof', scope: 'commit' },
    steps: [...productSteps, ...audit.steps],
  };
}

function runMutationProfile(profile) {
  const runner = process.env.SNIPTALE_TRUSTED_CI_ROOT
    ? '/opt/sniptale-trusted/tooling/test/mutation/run-profile.mjs'
    : 'tooling/test/mutation/run-profile.mjs';
  const result = spawnSync(
    process.execPath,
    [runner, profile, process.env.GITHUB_RUN_ID ?? 'local'],
    { encoding: 'utf8', env: process.env }
  );
  return createProcessStep(`Mutation ${profile}`, result, {
    advice: `Inspect .tmp/mutation/${profile}/${process.env.GITHUB_RUN_ID ?? 'local'}/summary.json`,
  });
}

export async function collectCiReleaseResults({
  session,
  reuseFastProof = false,
  productProofCollector = () =>
    collectFullVerifyStepResults({
      releaseMode: true,
      verifyScope: resolveRepositoryVerifyScope(),
    }),
  auditCollector = collectAuditProfileResult,
  mutationCollector = runMutationProfile,
} = {}) {
  capability('release');
  const productSteps = [
    ...(reuseFastProof
      ? [createSkippedStep('Fast proof reuse', 'verified exact commit-bound proof receipt')]
      : []),
    ...(await productProofCollector()).steps,
  ];
  if (hasFailure(productSteps)) {
    return {
      context: { mode: 'ci:release', scope: 'commit' },
      executionMode: reuseFastProof ? 'reuse-fast-proof' : 'default',
      steps: productSteps,
    };
  }
  const audit = await auditCollector({ profileId: 'release', session });
  if (hasFailure(audit.steps)) {
    return {
      context: { mode: 'ci:release', scope: 'commit' },
      executionMode: reuseFastProof ? 'reuse-fast-proof' : 'default',
      steps: [...productSteps, ...audit.steps],
    };
  }
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
