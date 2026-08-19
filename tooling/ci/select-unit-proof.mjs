import fs from 'node:fs';
import path from 'node:path';
import { verifyMainProof } from './verify-main-proof.mjs';
import { isExecutedAsScript } from '../qa/core/shared.mjs';
import {
  downloadSuccessfulMainProof,
  removeSafeRestoreOutput,
  runGitHubCli,
} from './main-proof-transport.mjs';

const UNIT_PROOF_FILE = '.tmp/qa/unit-proof.json';

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
  { commandRunner = runGitHubCli, selector = selectVerifiedUnitProof } = {}
) {
  try {
    downloadSuccessfulMainProof({ artifactRoot, commandRunner, commit });
    return selector(artifactRoot, commit, destination);
  } catch {
    removeSafeRestoreOutput(artifactRoot, ['main-proof-'], { recursive: true });
    removeSafeRestoreOutput(destination, ['unit-proof-'], { recursive: false });
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
