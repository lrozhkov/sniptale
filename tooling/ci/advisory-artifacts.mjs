import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { collectRepoAuditEvidence } from '../qa/evidence/repo-audit-evidence/core.mjs';
import {
  persistRepoAuditEvidence,
  persistRepoAuditTopology,
} from '../qa/evidence/repo-audit-evidence/artifacts.mjs';
import { runNamingCheck } from '../qa/guards/quality/naming/check.mjs';
import { resolveRepositoryWritePath } from '../qa/policy/paths/repository-contained-paths.mjs';
import { MUTATION_PROFILES, resolveMutationRunLabel } from './mutation-policy.mjs';
import { isExecutedAsScript } from '../qa/runtime/process/shared-cli.mjs';

export const CI_ADVISORY_SUMMARY_PATH = '.tmp/repo-audit/advisory-summary.json';
const COLLECTOR_FAILURE_REASONS = new Set(['report-missing', 'runner-failed', 'tool-unavailable']);

function collectorErrorMessage(error) {
  if (error instanceof Error) return error.message;
  return typeof error === 'string' ? error : 'Collector failed';
}

export function classifyCollectorFailure(error) {
  if (error != null && typeof error === 'object' && COLLECTOR_FAILURE_REASONS.has(error.reason)) {
    return error.reason;
  }
  const message = collectorErrorMessage(error);
  if (/Mutation CLI is unavailable/u.test(message)) return 'tool-unavailable';
  if (/mutation report is missing/iu.test(message)) return 'report-missing';
  return 'runner-failed';
}

export function sanitizeBoundedCollectorMessage(error) {
  switch (classifyCollectorFailure(error)) {
    case 'tool-unavailable':
      return 'Required advisory collector tool is unavailable.';
    case 'report-missing':
      return 'Advisory collector completed without its required report.';
    default:
      return 'Advisory collector failed; inspect bounded CI logs.';
  }
}

function createCollectorFailure(reason, message, exitCode = 1) {
  return Object.assign(new Error(message), { exitCode, reason });
}

export function collectMutationProfile(profile, environment = process.env) {
  const runner = environment.SNIPTALE_TRUSTED_CI_ROOT
    ? '/opt/sniptale-trusted/tooling/test/mutation/run-profile.mjs'
    : 'tooling/test/mutation/run-profile.mjs';
  const runLabel = resolveMutationRunLabel(environment);
  const result = spawnSync(process.execPath, [runner, profile, runLabel], {
    encoding: 'utf8',
    env: environment,
  });
  if (result.error) {
    throw createCollectorFailure('tool-unavailable', 'Mutation profile runner is unavailable');
  }
  if ((result.status ?? 1) !== 0) {
    const message = result.stderr || result.stdout || `Mutation ${profile} failed`;
    let reason = 'runner-failed';
    if (/Mutation CLI is unavailable/u.test(message)) reason = 'tool-unavailable';
    else if (/Mutation report is missing/iu.test(message)) reason = 'report-missing';
    throw createCollectorFailure(reason, message, result.status ?? 1);
  }
  const artifactPath = `.tmp/mutation/${profile}/${runLabel}/summary.json`;
  if (!fs.existsSync(artifactPath)) {
    throw createCollectorFailure(
      'report-missing',
      `Mutation report is missing for profile ${profile}`
    );
  }
  return artifactPath;
}

function writeSummary(summary, rootDir) {
  const target = resolveRepositoryWritePath(rootDir, CI_ADVISORY_SUMMARY_PATH);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(summary, null, 2)}\n`, { mode: 0o600 });
}

export function collectCiAdvisoryArtifacts(
  { lane, rootDir = process.cwd() },
  {
    evidenceCollector = collectRepoAuditEvidence,
    evidencePersister = persistRepoAuditEvidence,
    topologyCollector = () => runNamingCheck({ repoWide: true }),
    topologyPersister = persistRepoAuditTopology,
    mutationCollector = collectMutationProfile,
  } = {}
) {
  const collectors = [
    {
      id: 'audit-evidence',
      run: () => evidencePersister(evidenceCollector({ rootDir }), { rootDir }).artifactPath,
    },
    {
      id: 'topology-report',
      run: () => topologyPersister(topologyCollector(), { rootDir }).artifactPath,
    },
    ...(lane === 'release'
      ? MUTATION_PROFILES.map((profile) => ({
          id: `mutation-${profile}`,
          run: () => mutationCollector(profile),
        }))
      : []),
  ];
  const results = collectors.map(({ id, run }) => {
    try {
      return { id, status: 'collected', artifactPath: run() };
    } catch (error) {
      const reason = classifyCollectorFailure(error);
      const message = sanitizeBoundedCollectorMessage(error);
      const exitCode =
        error != null && typeof error === 'object' && Number.isInteger(error.exitCode)
          ? error.exitCode
          : 1;
      process.stderr.write(`[advisory] ${id}: ${reason}: ${message}\n`);
      return { id, status: 'failed', reason, exitCode, message };
    }
  });
  const summary = {
    schemaVersion: 1,
    artifactKind: 'sniptale-ci-advisory-summary',
    generatedAt: new Date().toISOString(),
    lane,
    blocking: false,
    results,
  };
  try {
    writeSummary(summary, rootDir);
  } catch {
    // Advisory persistence must never alter the canonical gate result.
  }
  return summary;
}

if (isExecutedAsScript(import.meta.url)) {
  const lane = process.argv[2];
  if (!['proof', 'release'].includes(lane)) {
    throw new Error('Usage: advisory-artifacts.mjs <proof|release>');
  }
  collectCiAdvisoryArtifacts({ lane });
}
