import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export function runGitHubCli(args) {
  const result = spawnSync('gh', args, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error((result.stderr ?? '').trim() || 'gh command failed');
  return result.stdout;
}

function resolveRunAttempt(runId, commandRunner) {
  const attempt = Number(
    commandRunner([
      'api',
      `repos/{owner}/{repo}/actions/runs/${runId}`,
      '--jq',
      '.run_attempt',
    ]).trim()
  );
  if (!Number.isSafeInteger(attempt) || attempt < 1) {
    throw new Error(`GitHub run ${runId} returned an invalid attempt.`);
  }
  return attempt;
}

export function downloadSuccessfulMainProof({
  artifactRoot,
  commandRunner = runGitHubCli,
  commit,
}) {
  const parsed = JSON.parse(
    commandRunner([
      'run',
      'list',
      '--workflow',
      'quality-gate.yml',
      '--branch',
      'main',
      '--commit',
      commit,
      '--status',
      'success',
      '--limit',
      '20',
      '--json',
      'databaseId,headSha',
    ])
  );
  if (!Array.isArray(parsed)) throw new Error('GitHub run discovery returned malformed JSON.');
  const matches = parsed.filter(
    (run) =>
      run &&
      typeof run === 'object' &&
      run.headSha === commit &&
      Number.isSafeInteger(run.databaseId) &&
      run.databaseId > 0
  );
  for (const { databaseId: runId } of matches) {
    try {
      const attempt = resolveRunAttempt(runId, commandRunner);
      commandRunner([
        'run',
        'download',
        String(runId),
        '--name',
        `fast-proof-${commit}-${runId}-${attempt}`,
        '--dir',
        artifactRoot,
      ]);
      return runId;
    } catch {
      fs.rmSync(artifactRoot, { recursive: true, force: true });
    }
  }
  throw new Error('Expected a successful main fast-proof artifact.');
}

export function downloadLatestReleaseProof({ artifactRoot, commandRunner = runGitHubCli }) {
  const parsed = JSON.parse(
    commandRunner([
      'run',
      'list',
      '--workflow',
      'quality-gate.yml',
      '--branch',
      'main',
      '--event',
      'workflow_dispatch',
      '--status',
      'success',
      '--limit',
      '20',
      '--json',
      'databaseId,headSha',
    ])
  );
  if (!Array.isArray(parsed)) throw new Error('GitHub run discovery returned malformed JSON.');
  for (const run of parsed) {
    if (
      !run ||
      typeof run !== 'object' ||
      !Number.isSafeInteger(run.databaseId) ||
      run.databaseId <= 0 ||
      !/^[a-f0-9]{40}$/u.test(run.headSha ?? '')
    ) {
      continue;
    }
    try {
      const attempt = resolveRunAttempt(run.databaseId, commandRunner);
      commandRunner([
        'run',
        'download',
        String(run.databaseId),
        '--name',
        `release-provenance-${run.headSha}-${run.databaseId}-${attempt}`,
        '--dir',
        artifactRoot,
      ]);
      return { runId: run.databaseId, runAttempt: attempt, commit: run.headSha };
    } catch {
      fs.rmSync(artifactRoot, { recursive: true, force: true });
    }
  }
  throw new Error('Expected a successful release provenance proof run.');
}

export function removeSafeRestoreOutput(value, prefixes, { recursive }) {
  const resolved = path.resolve(value);
  if (!prefixes.some((prefix) => path.basename(resolved).startsWith(prefix))) {
    throw new Error(`Refusing unsafe proof cleanup target: ${resolved}`);
  }
  fs.rmSync(resolved, { recursive, force: true });
}
