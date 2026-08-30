import path from 'node:path';
import { verifyMainProof, verifyReleaseProof } from './verify-main-proof.mjs';
import { isExecutedAsScript } from '../qa/runtime/process/shared-cli.mjs';
import {
  downloadSuccessfulMainProof,
  downloadLatestReleaseProof,
  removeSafeRestoreOutput,
  runGitHubCli,
} from './main-proof-transport.mjs';
import { sealVerifiedProofFiles } from './proof-artifact-seal.mjs';

const UNIT_PROOF_FILE = '.tmp/qa/unit-proof.json';

export function selectVerifiedUnitProof(
  artifactRoot,
  commit,
  destination,
  { verifier = verifyMainProof } = {}
) {
  const root = path.resolve(artifactRoot);
  const { manifest } = verifier(root, commit);
  const resolvedDestination = path.resolve(destination);
  sealVerifiedProofFiles(root, manifest, [
    { destination: resolvedDestination, relativePath: UNIT_PROOF_FILE },
  ]);
  return resolvedDestination;
}

export function restoreLatestReleaseUnitProof(
  artifactRoot,
  destination,
  { commandRunner = runGitHubCli } = {}
) {
  try {
    const source = downloadLatestReleaseProof({ artifactRoot, commandRunner });
    return selectVerifiedUnitProof(artifactRoot, source.commit, destination, {
      verifier: verifyReleaseProof,
    });
  } catch {
    removeSafeRestoreOutput(artifactRoot, ['release-unit-proof'], { recursive: true });
    removeSafeRestoreOutput(destination, ['unit-proof'], { recursive: false });
    return null;
  }
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
  if (mode === 'restore-latest-release') {
    if (!first || !second) {
      throw new Error(
        'Usage: select-unit-proof.mjs restore-latest-release <artifact-root> <destination>'
      );
    }
    const restored = restoreLatestReleaseUnitProof(first, second);
    if (restored) process.stdout.write(`${restored}\n`);
    else process.stderr.write('Verified release unit proof unavailable; running full units.\n');
    process.exit(0);
  }
  const [artifactRoot, commit, destination] = [mode, first, second];
  if (!artifactRoot || !commit || !destination) {
    throw new Error('Usage: select-unit-proof.mjs <artifact-root> <commit> <destination>');
  }
  process.stdout.write(`${selectVerifiedUnitProof(artifactRoot, commit, destination)}\n`);
}
