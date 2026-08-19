import fs from 'node:fs';
import path from 'node:path';
import { isExecutedAsScript } from '../qa/core/shared.mjs';
import {
  downloadSuccessfulMainProof,
  removeSafeRestoreOutput,
  runGitHubCli,
} from './main-proof-transport.mjs';
import { verifyMainProof } from './verify-main-proof.mjs';

const CODEQL_PROOF_FILE = '.tmp/qa/codeql-proof.json';
const CODEQL_SARIF_FILE = '.tmp/codeql/results.filtered.sarif';

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

export function restoreVerifiedMainCodeqlProof(
  commit,
  artifactRoot,
  proofDestination,
  sarifDestination,
  { commandRunner = runGitHubCli, selector = selectVerifiedCodeqlProof } = {}
) {
  try {
    downloadSuccessfulMainProof({ artifactRoot, commandRunner, commit });
    return selector(artifactRoot, commit, proofDestination, sarifDestination);
  } catch {
    removeSafeRestoreOutput(artifactRoot, ['main-codeql-proof-'], { recursive: true });
    removeSafeRestoreOutput(proofDestination, ['codeql-proof-'], { recursive: false });
    removeSafeRestoreOutput(sarifDestination, ['codeql-sarif-'], { recursive: false });
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
