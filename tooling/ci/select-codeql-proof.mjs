import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { isExecutedAsScript } from '../qa/core/shared.mjs';
import { verifyMainProof } from './verify-main-proof.mjs';

const CODEQL_PROOF_FILE = '.tmp/qa/codeql-proof.json';
const CODEQL_SARIF_FILE = '.tmp/codeql/results.filtered.sarif';

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

function copyVerifiedFile(root, manifest, relativePath, destination) {
  if (!manifest.files.some(({ file }) => file === relativePath)) {
    throw new Error(`Successful main proof does not contain ${relativePath}.`);
  }
  const source = path.join(root, relativePath);
  const stat = fs.lstatSync(source);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`Unsafe CodeQL proof input: ${relativePath}.`);
  }
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
}

export function selectVerifiedCodeqlProof(
  artifactRoot,
  commit,
  proofDestination,
  sarifDestination
) {
  const root = path.resolve(artifactRoot);
  const { manifest } = verifyMainProof(root, commit);
  copyVerifiedFile(root, manifest, CODEQL_PROOF_FILE, path.resolve(proofDestination));
  try {
    copyVerifiedFile(root, manifest, CODEQL_SARIF_FILE, path.resolve(sarifDestination));
  } catch (error) {
    fs.rmSync(path.resolve(proofDestination), { force: true });
    throw error;
  }
  return { proofPath: path.resolve(proofDestination), sarifPath: path.resolve(sarifDestination) };
}

function removeRestoreOutput(value, prefix, { recursive }) {
  const resolved = path.resolve(value);
  if (!path.basename(resolved).startsWith(prefix)) {
    throw new Error(`Refusing unsafe CodeQL proof cleanup target: ${resolved}`);
  }
  fs.rmSync(resolved, { recursive, force: true });
}

export function restoreVerifiedMainCodeqlProof(
  commit,
  artifactRoot,
  proofDestination,
  sarifDestination,
  { commandRunner = runGh, selector = selectVerifiedCodeqlProof } = {}
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
    commandRunner([
      'run',
      'download',
      String(runId),
      '--name',
      `canonical-qa-${commit}-${runId}`,
      '--dir',
      artifactRoot,
    ]);
    return selector(artifactRoot, commit, proofDestination, sarifDestination);
  } catch {
    removeRestoreOutput(artifactRoot, 'main-codeql-proof-', { recursive: true });
    removeRestoreOutput(proofDestination, 'codeql-proof-', { recursive: false });
    removeRestoreOutput(sarifDestination, 'codeql-sarif-', { recursive: false });
    return null;
  }
}

if (isExecutedAsScript(import.meta.url)) {
  const [mode, first, second, third, fourth] = process.argv.slice(2);
  if (mode === 'restore') {
    if (!first || !second || !third || !fourth) {
      throw new Error(
        'Usage: select-codeql-proof.mjs restore <commit> <artifact-root> <proof-destination> <sarif-destination>'
      );
    }
    const restored = restoreVerifiedMainCodeqlProof(first, second, third, fourth);
    if (restored) process.stdout.write(`${JSON.stringify(restored)}\n`);
    else process.stderr.write('Verified main CodeQL proof unavailable; running full CodeQL.\n');
    process.exit(0);
  }
  const [artifactRoot, commit, proofDestination, sarifDestination] = [mode, first, second, third];
  if (!artifactRoot || !commit || !proofDestination || !sarifDestination) {
    throw new Error(
      'Usage: select-codeql-proof.mjs <artifact-root> <commit> <proof-destination> <sarif-destination>'
    );
  }
  process.stdout.write(
    `${JSON.stringify(selectVerifiedCodeqlProof(artifactRoot, commit, proofDestination, sarifDestination))}\n`
  );
}
