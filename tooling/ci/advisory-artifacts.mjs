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

function collectMutationProfile(profile) {
  const runner = process.env.SNIPTALE_TRUSTED_CI_ROOT
    ? '/opt/sniptale-trusted/tooling/test/mutation/run-profile.mjs'
    : 'tooling/test/mutation/run-profile.mjs';
  const result = spawnSync(process.execPath, [runner, profile, resolveMutationRunLabel()], {
    encoding: 'utf8',
    env: process.env,
  });
  if ((result.status ?? 1) !== 0) {
    throw new Error(result.stderr || result.stdout || `Mutation ${profile} failed`);
  }
  return `.tmp/mutation/${profile}/${resolveMutationRunLabel()}/summary.json`;
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
    } catch {
      return { id, status: 'failed', message: 'collector failed; inspect bounded CI logs' };
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
