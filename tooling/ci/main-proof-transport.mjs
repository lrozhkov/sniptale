import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export function runGitHubCli(args) {
  const result = spawnSync('gh', args, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error((result.stderr ?? '').trim() || 'gh command failed');
  return result.stdout;
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
  if (matches.length === 0) throw new Error('Expected a successful main proof run.');
  const runId = matches[0].databaseId;
  commandRunner([
    'run',
    'download',
    String(runId),
    '--name',
    `canonical-qa-${commit}-${runId}`,
    '--dir',
    artifactRoot,
  ]);
  return runId;
}

export function removeSafeRestoreOutput(value, prefixes, { recursive }) {
  const resolved = path.resolve(value);
  if (!prefixes.some((prefix) => path.basename(resolved).startsWith(prefix))) {
    throw new Error(`Refusing unsafe proof cleanup target: ${resolved}`);
  }
  fs.rmSync(resolved, { recursive, force: true });
}
