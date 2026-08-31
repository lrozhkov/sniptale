import path from 'node:path';
import { isExecutedAsScript } from '../qa/runtime/process/shared-cli.mjs';
import {
  downloadSuccessfulMainProof,
  downloadLatestReleaseProof,
  removeSafeRestoreOutput,
  runGitHubCli,
} from './main-proof-transport.mjs';
import { verifyMainProof, verifyReleaseProof } from './verify-main-proof.mjs';
import { sealVerifiedProofFiles } from './proof-artifact-seal.mjs';

const CODEQL_PROOF_FILE = '.tmp/qa/codeql-proof.json';
const CODEQL_SARIF_FILE = '.tmp/codeql/results.filtered.sarif';

export function selectVerifiedCodeqlProof(
  artifactRoot,
  commit,
  proofDestination,
  sarifDestination,
  { verifier = verifyMainProof } = {}
) {
  const root = path.resolve(artifactRoot);
  const { manifest } = verifier(root, commit);
  const [proofPath, sarifPath] = sealVerifiedProofFiles(root, manifest, [
    { destination: proofDestination, relativePath: CODEQL_PROOF_FILE },
    { destination: sarifDestination, relativePath: CODEQL_SARIF_FILE },
  ]);
  return { proofPath, sarifPath };
}

export function restoreLatestReleaseCodeqlProof(
  artifactRoot,
  proofDestination,
  sarifDestination,
  { commandRunner = runGitHubCli } = {}
) {
  try {
    const source = downloadLatestReleaseProof({ artifactRoot, commandRunner });
    return selectVerifiedCodeqlProof(
      artifactRoot,
      source.commit,
      proofDestination,
      sarifDestination,
      { verifier: verifyReleaseProof }
    );
  } catch {
    removeSafeRestoreOutput(artifactRoot, ['release-codeql-proof'], { recursive: true });
    removeSafeRestoreOutput(proofDestination, ['codeql-proof'], { recursive: false });
    removeSafeRestoreOutput(sarifDestination, ['codeql-sarif'], { recursive: false });
    return null;
  }
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
  if (mode === 'restore-latest-release') {
    if (!first || !second || !third) {
      throw new Error(
        'Usage: select-codeql-proof.mjs restore-latest-release <artifact-root> <proof-destination> <sarif-destination>'
      );
    }
    const restored = restoreLatestReleaseCodeqlProof(first, second, third);
    if (restored) process.stdout.write(`${JSON.stringify(restored)}\n`);
    else process.stderr.write('Verified release CodeQL proof unavailable; running full CodeQL.\n');
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
