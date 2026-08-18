import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { verifyMainProof } from './verify-main-proof.mjs';
import { isExecutedAsScript } from '../qa/core/shared.mjs';

const UNIT_PROOF_FILE = '.tmp/qa/unit-proof.json';

function runGh(args) {
  const result = spawnSync('gh', args, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error((result.stderr ?? '').trim() || 'gh command failed');
  return result.stdout;
}

function resolveExactMainRun(value, commit) {
  const parsed = JSON.parse(value);
  if (!Array.isArray(parsed)) throw new Error('GitHub run discovery returned malformed JSON.');
  const matches = parsed.filter(
    (run) =>
      run &&
      typeof run === 'object' &&
      run.headSha === commit &&
      Number.isSafeInteger(run.databaseId) &&
      run.databaseId > 0
  );
  if (matches.length !== 1) throw new Error('Expected exactly one successful main proof run.');
  return matches[0].databaseId;
}

function removeRestoreOutput(value, prefix, { recursive }) {
  const resolved = path.resolve(value);
  if (!path.basename(resolved).startsWith(prefix)) {
    throw new Error(`Refusing unsafe unit proof cleanup target: ${resolved}`);
  }
  fs.rmSync(resolved, { recursive, force: true });
}

export function selectVerifiedUnitProof(artifactRoot, commit, destination) {
  const root = path.resolve(artifactRoot);
  const { manifest } = verifyMainProof(root, commit);
  if (!manifest.files.some(({ file }) => file === UNIT_PROOF_FILE)) {
    throw new Error('Successful main proof does not contain a full unit proof.');
  }
  const source = path.join(root, UNIT_PROOF_FILE);
  const sourceStat = fs.lstatSync(source);
  if (!sourceStat.isFile() || sourceStat.isSymbolicLink()) {
    throw new Error('Unsafe full unit proof in successful main artifact.');
  }
  const resolvedDestination = path.resolve(destination);
  fs.mkdirSync(path.dirname(resolvedDestination), { recursive: true });
  fs.copyFileSync(source, resolvedDestination, fs.constants.COPYFILE_EXCL);
  return resolvedDestination;
}

export function restoreVerifiedMainUnitProof(
  commit,
  artifactRoot,
  destination,
  { commandRunner = runGh, selector = selectVerifiedUnitProof } = {}
) {
  try {
    const runs = commandRunner([
      'run',
      'list',
      '--workflow',
      'quality-gate.yml',
      '--branch',
      'main',
      '--commit',
      commit,
      '--event',
      'push',
      '--status',
      'success',
      '--limit',
      '20',
      '--json',
      'databaseId,headSha',
    ]);
    const runId = resolveExactMainRun(runs, commit);
    const artifactName = `canonical-qa-${commit}-${runId}`;
    commandRunner([
      'run',
      'download',
      String(runId),
      '--name',
      artifactName,
      '--dir',
      artifactRoot,
    ]);
    return selector(artifactRoot, commit, destination);
  } catch {
    removeRestoreOutput(artifactRoot, 'main-proof-', { recursive: true });
    removeRestoreOutput(destination, 'unit-proof-', { recursive: false });
    return null;
  }
}

if (isExecutedAsScript(import.meta.url)) {
  const [mode, first, second, third] = process.argv.slice(2);
  if (mode === 'restore') {
    if (!first || !second || !third) {
      throw new Error(
        'Usage: select-unit-proof.mjs restore <commit> <artifact-root> <destination>'
      );
    }
    const restored = restoreVerifiedMainUnitProof(first, second, third);
    if (restored) process.stdout.write(`${restored}\n`);
    else process.stderr.write('Verified main unit proof unavailable; running full units.\n');
    process.exit(0);
  }
  const [artifactRoot, commit, destination] = [mode, first, second];
  if (!artifactRoot || !commit || !destination) {
    throw new Error('Usage: select-unit-proof.mjs <artifact-root> <commit> <destination>');
  }
  process.stdout.write(`${selectVerifiedUnitProof(artifactRoot, commit, destination)}\n`);
}
