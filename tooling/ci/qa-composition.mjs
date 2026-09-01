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
import { resolveFullVerifyScope } from '../qa/composition/repository/full-verification/scope.mjs';
import { collectCodeFiles } from '../qa/analysis/repository/shared-files.mjs';
import { runTimelineActivitySync } from '../qa/runtime/observability/timeline-context.mjs';
import { runNpm } from '../qa/runtime/process/shared-process.mjs';
import { runFullHarnessUnitTests, runUnitTests } from '../qa/proof/unit/verify-unit-tests.mjs';
import { HARNESS_QA_SUITE } from '../qa/composition/scope/qa-scope.mjs';
import { isHarnessQaFile } from '../qa/composition/scope/qa-scope.mjs';
import { runGit } from '../qa/runtime/scope/git-command.helpers.mjs';
import { measureAsyncStep } from '../qa/runtime/observability/step-timing.helpers.mjs';
import {
  ciExcludedControlLabels,
  createCiProductControlOccurrences,
} from './product-control-policy.mjs';
import { findQaStepDefinition } from '../qa/composition/catalog/definitions.mjs';
import { RELEASE_INHERITED_AUDIT_CONTROL_IDS } from './release-inheritance-policy.mjs';
import { attachProofPopulation } from './proof-population-policy.mjs';

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
  productProofCollector = (verifyScope) =>
    collectFullVerifyStepResults({
      includeArtifactSteps: false,
      includeTests: false,
      releaseMode: true,
      excludedControlLabels: ciExcludedControlLabels('proof'),
      verifyScope,
    }),
  auditCollector = collectAuditProfileResult,
  harnessTestCollector = collectFullHarnessUnitTestStep,
  productionBuildCollector = collectFreshProductionBuildStep,
  scopeResolver = resolveCiScope,
} = {}) {
  capability('proof');
  const verifyScope = scopeResolver();
  const [product, audit, productionBuild] = await Promise.all([
    productProofCollector(verifyScope),
    auditCollector({ profileId: 'pr', session }),
    Promise.resolve(productionBuildCollector()),
  ]);
  const harnessTests = await harnessTestCollector(resolveCiHarnessTestPlan(verifyScope));
  const coverageStep = audit.steps.find(({ label }) => label === 'Full product coverage');
  if (!coverageStep) throw new Error('Fast proof did not produce full product coverage.');
  const unitStep = {
    ...coverageStep,
    label: 'Unit tests',
    detail: [coverageStep.detail, 'shared-execution=full-product-test-proof']
      .filter(Boolean)
      .join('; '),
  };
  return {
    context: { mode: 'ci:proof', scope: 'commit' },
    steps: [...product.steps, unitStep, harnessTests, productionBuild, ...audit.steps].map((step) =>
      attachProofPopulation(step, verifyScope)
    ),
  };
}

export async function collectFullHarnessUnitTestStep({ full = true, relatedFiles = [] } = {}) {
  if (!full && relatedFiles.length === 0) {
    return createOkStep('Harness unit tests', 'affected closure: no matching tests');
  }
  const { durationMs, value } = await measureAsyncStep(() =>
    full
      ? runFullHarnessUnitTests()
      : runUnitTests({ relatedFiles, requireTests: false, suite: HARNESS_QA_SUITE })
  );
  return value.status === 0
    ? {
        ...createOkStep(
          'Harness unit tests',
          full ? 'full partitioned harness suite' : 'affected harness closure'
        ),
        durationMs,
      }
    : {
        label: 'Harness unit tests',
        status: 'failed',
        summary: 'failed',
        stdout: value.stdout ?? '',
        stderr: value.stderr ?? '',
        durationMs,
      };
}

export function resolveCiHarnessTestPlan(
  verifyScope,
  { environment = process.env, gitRunner = runGit } = {}
) {
  if (environment.SNIPTALE_CI_FULL_HARNESS === '1') {
    return { full: true, relatedFiles: [], reason: 'explicit periodic/full proof' };
  }
  const candidateDiff = resolveCiCandidateDiff({ environment, gitRunner });
  if (!candidateDiff.available) {
    return { full: true, relatedFiles: [], reason: 'candidate base unavailable' };
  }
  const { candidateFiles, requiresFullHarness } = candidateDiff;
  if (requiresFullHarness) {
    return {
      full: true,
      relatedFiles: [],
      reason: 'candidate deletion, rename, or type change',
    };
  }
  if (candidateFiles.some(isHarnessQaFile)) {
    return { full: true, relatedFiles: [], reason: 'CI/tooling control changed' };
  }
  return {
    full: false,
    relatedFiles: candidateFiles.filter((file) => fs.existsSync(file)),
    reason: 'product-only candidate affected closure',
    repositoryScope: verifyScope?.mode ?? null,
  };
}

export function resolveCiCandidateDiff({ environment = process.env, gitRunner = runGit } = {}) {
  const baseSha = environment.SNIPTALE_BASE_SHA;
  if (!/^[0-9a-f]{40}$/u.test(baseSha ?? '')) {
    return {
      available: false,
      candidateFiles: [],
      comparisonRevision: null,
      deletedFiles: [],
      requiresFullHarness: true,
    };
  }
  const mergeBaseResult = gitRunner(['merge-base', baseSha, 'HEAD']);
  const comparisonRevision = mergeBaseResult.stdout.trim();
  if (mergeBaseResult.skipped || !/^[0-9a-f]{40}$/u.test(comparisonRevision)) {
    return {
      available: false,
      candidateFiles: [],
      comparisonRevision: null,
      deletedFiles: [],
      requiresFullHarness: true,
    };
  }
  const result = gitRunner([
    'diff',
    '--name-status',
    '-z',
    '--find-renames',
    '--diff-filter=ACMRTD',
    `${comparisonRevision}..HEAD`,
  ]);
  if (result.skipped) {
    return {
      available: false,
      candidateFiles: [],
      comparisonRevision: null,
      deletedFiles: [],
      requiresFullHarness: true,
    };
  }
  const fields = result.stdout.split('\0');
  if (fields.at(-1) === '') fields.pop();
  const candidateFiles = [];
  const deletedFiles = [];
  let requiresFullHarness = false;
  for (let index = 0; index < fields.length;) {
    const status = fields[index++];
    if (!/^(?:[ADMT]|[CR]\d{1,3})$/u.test(status ?? '')) {
      throw new Error('Malformed NUL-delimited candidate diff status.');
    }
    const source = fields[index++];
    if (!source) throw new Error('Malformed NUL-delimited candidate diff path.');
    candidateFiles.push(source);
    if (status === 'D') deletedFiles.push(source);
    if (status === 'D' || status === 'T' || status.startsWith('R') || status.startsWith('C')) {
      requiresFullHarness = true;
    }
    if (status.startsWith('R') || status.startsWith('C')) {
      const destination = fields[index++];
      if (!destination) throw new Error('Malformed NUL-delimited candidate rename path.');
      candidateFiles.push(destination);
    }
  }
  candidateFiles.sort();
  return {
    available: true,
    candidateFiles,
    comparisonRevision,
    deletedFiles: deletedFiles.sort(),
    requiresFullHarness,
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
  return runTimelineActivitySync(
    { activityId: 'scope-resolution', kind: 'scope-resolution' },
    () => {
      const repositoryScope = resolveRepositoryVerifyScope();
      const candidateDiff = resolveCiCandidateDiff();
      const existingCandidateFiles = candidateDiff.candidateFiles.filter((file) =>
        fs.existsSync(file)
      );
      const structuralCodeFiles = candidateDiff.available
        ? existingCandidateFiles.length > 0
          ? collectCodeFiles(existingCandidateFiles)
          : []
        : resolveFullVerifyScope().codeFiles;
      return {
        ...repositoryScope,
        structuralCodeFiles,
        structuralComparisonRevision: candidateDiff.comparisonRevision ?? 'HEAD',
        structuralDeletedFiles: candidateDiff.deletedFiles,
      };
    }
  );
}

const RELEASE_DELTA_LABELS = new Set(['Build', 'Release archive']);
const REUSED_FAST_AUDIT_CONTROL_IDS = Object.freeze(
  RELEASE_INHERITED_AUDIT_CONTROL_IDS.map((id) => id.replace(/^qa\.rule\./u, ''))
);

function createInheritedFastControlStep({ id, label }, admission) {
  if (
    !admission?.proofSemanticDigest ||
    !admission.proofManifestDigest ||
    !admission.sourceRunRecord ||
    !admission.sourceRunLog
  ) {
    throw new Error('Fast proof admission is missing structured inheritance evidence.');
  }
  return runTimelineActivitySync(
    { activityId: `fast-proof-reuse.${id}`, kind: 'proof-reuse', reused: true },
    () => ({
      label,
      status: 'inherited',
      detail: 'inherited from admitted exact Fast proof',
      inheritance: {
        sourceProofSemanticDigest: admission.proofSemanticDigest,
        sourceProofManifestDigest: admission.proofManifestDigest,
        sourceControlId: id,
        sourceRunRecord: `fast-proof/${admission.sourceRunRecord}`,
        evidenceFiles: [
          `fast-proof/${admission.sourceRunRecord}`,
          `fast-proof/${admission.sourceRunLog}`,
        ],
      },
    })
  );
}

async function collectVerifiedFastProofReleaseSteps(releaseDeltaCollector, admission) {
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
        : createInheritedFastControlStep(occurrence, admission)
    ),
  ];
}

export async function collectCiReleaseResults({
  session,
  fastProofAdmission,
  scopeResolver = resolveCiScope,
  releaseDeltaCollector = (verifyScope, { includeArtifactSteps }) =>
    collectReleaseDeltaStepResults({
      excludedControlLabels: ciExcludedControlLabels('release'),
      includeArtifactSteps,
      verifyScope,
    }),
  auditCollector = collectAuditProfileResult,
} = {}) {
  capability('release');
  if (
    fastProofAdmission?.artifactKind !== 'sniptale-fast-proof-admission' ||
    fastProofAdmission.outcome !== 'admitted'
  ) {
    throw new Error('CI release requires an admitted exact Fast proof before release execution.');
  }
  const verifyScope = scopeResolver();
  const collectReleaseDelta = (includeArtifactSteps) => () =>
    releaseDeltaCollector(verifyScope, { includeArtifactSteps });
  const productSteps = await collectVerifiedFastProofReleaseSteps(
    collectReleaseDelta(true),
    fastProofAdmission
  );
  const productionBuild = createInheritedFastControlStep(
    { id: 'qa.rule.production-build', label: 'Production build' },
    fastProofAdmission
  );
  const audit = await auditCollector({
    profileId: 'release',
    reusedControlIds: REUSED_FAST_AUDIT_CONTROL_IDS,
    session,
  });
  const inheritedAuditLabels = new Set(
    REUSED_FAST_AUDIT_CONTROL_IDS.map((controlId) => {
      const definition = findQaStepDefinition({
        id: `qa.rule.${controlId}`,
        lane: 'audit',
      });
      if (!definition) throw new Error(`Missing inherited audit control: ${controlId}`);
      return definition.label;
    })
  );
  return {
    context: { mode: 'ci:release', scope: 'commit' },
    executionMode: 'admitted-fast-proof',
    steps: [
      ...productSteps,
      productionBuild,
      ...audit.steps.map((step) => {
        if (!inheritedAuditLabels.has(step.label)) return step;
        const definition = findQaStepDefinition({
          label: step.label,
          lane: 'audit',
        });
        return createInheritedFastControlStep(definition, fastProofAdmission);
      }),
    ].map((step) => attachProofPopulation(step, verifyScope)),
  };
}
