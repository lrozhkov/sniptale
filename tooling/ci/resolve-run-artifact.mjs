import { spawnSync } from 'node:child_process';

export function selectLatestRunArtifact(artifacts, prefix) {
  const candidates = artifacts
    .filter((artifact) => artifact?.expired === false && typeof artifact.name === 'string')
    .filter((artifact) => artifact.name.startsWith(prefix))
    .map((artifact) => ({ artifact, attempt: artifact.name.slice(prefix.length) }))
    .filter(({ attempt }) => /^[1-9]\d*$/u.test(attempt))
    .sort((left, right) => Number(left.attempt) - Number(right.attempt));
  if (candidates.length === 0) throw new Error(`No live run artifact matches ${prefix}<attempt>.`);
  const selected = candidates.at(-1);
  const sameAttempt = candidates.filter(({ attempt }) => attempt === selected.attempt);
  if (sameAttempt.length !== 1) throw new Error('Run artifact attempt identity is ambiguous.');
  return selected.artifact.name;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [runId, prefix] = process.argv.slice(2);
  if (!/^[1-9]\d*$/u.test(runId ?? '') || !prefix) {
    throw new Error('Usage: resolve-run-artifact.mjs <run-id> <artifact-prefix>');
  }
  const repository = process.env.GITHUB_REPOSITORY ?? 'lrozhkov/sniptale';
  const result = spawnSync(
    'gh',
    ['api', `repos/${repository}/actions/runs/${runId}/artifacts?per_page=100`],
    { encoding: 'utf8' }
  );
  if (result.status !== 0) throw new Error(`Unable to list run artifacts: ${result.stderr.trim()}`);
  const response = JSON.parse(result.stdout);
  if (!Array.isArray(response.artifacts) || response.total_count !== response.artifacts.length) {
    throw new Error('Run artifact inventory is incomplete or malformed.');
  }
  process.stdout.write(`${selectLatestRunArtifact(response.artifacts, prefix)}\n`);
}
