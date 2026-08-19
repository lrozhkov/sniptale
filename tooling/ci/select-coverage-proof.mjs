import fs from 'node:fs';
import path from 'node:path';
import { isExecutedAsScript } from '../qa/core/shared.mjs';
import {
  downloadSuccessfulMainProof,
  removeSafeRestoreOutput,
  runGitHubCli,
} from './main-proof-transport.mjs';
import { verifyMainProof } from './verify-main-proof.mjs';

const PROOF_FILE = '.tmp/qa/coverage-proof.json';
const REPORT_DIRECTORY = '.tmp/coverage/canonical';

export function selectVerifiedCoverageProof(
  artifactRoot,
  commit,
  proofDestination,
  reportsDestination
) {
  const root = path.resolve(artifactRoot);
  const { manifest } = verifyMainProof(root, commit);
  const admitted = new Set(manifest.files.map(({ file }) => file));
  if (!admitted.has(PROOF_FILE))
    throw new Error('Successful main proof does not contain a coverage receipt.');
  const reportFiles = [...admitted].filter((file) => file.startsWith(`${REPORT_DIRECTORY}/`));
  if (reportFiles.length === 0)
    throw new Error('Successful main proof does not contain coverage reports.');
  fs.mkdirSync(path.dirname(proofDestination), { recursive: true });
  fs.copyFileSync(path.join(root, PROOF_FILE), proofDestination, fs.constants.COPYFILE_EXCL);
  fs.mkdirSync(reportsDestination, { recursive: false });
  try {
    for (const file of reportFiles) {
      const relative = file.slice(REPORT_DIRECTORY.length + 1);
      const source = path.join(root, file);
      const stat = fs.lstatSync(source);
      if (!stat.isFile() || stat.isSymbolicLink())
        throw new Error(`Unsafe coverage proof report: ${file}`);
      const destination = path.join(reportsDestination, relative);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
    }
  } catch (error) {
    fs.rmSync(proofDestination, { force: true });
    fs.rmSync(reportsDestination, { recursive: true, force: true });
    throw error;
  }
  return {
    proofPath: path.resolve(proofDestination),
    reportsPath: path.resolve(reportsDestination),
  };
}

export function restoreVerifiedMainCoverageProof(
  commit,
  artifactRoot,
  proofDestination,
  reportsDestination,
  { commandRunner = runGitHubCli } = {}
) {
  try {
    downloadSuccessfulMainProof({ artifactRoot, commandRunner, commit });
    return selectVerifiedCoverageProof(artifactRoot, commit, proofDestination, reportsDestination);
  } catch {
    removeSafeRestoreOutput(artifactRoot, ['main-coverage-proof-'], { recursive: true });
    removeSafeRestoreOutput(proofDestination, ['coverage-proof-'], { recursive: false });
    removeSafeRestoreOutput(reportsDestination, ['coverage-reports-'], { recursive: true });
    return null;
  }
}

if (isExecutedAsScript(import.meta.url)) {
  const [mode, first, second, third, fourth] = process.argv.slice(2);
  const restored =
    mode === 'restore'
      ? restoreVerifiedMainCoverageProof(first, second, third, fourth)
      : selectVerifiedCoverageProof(mode, first, second, third);
  if (restored) process.stdout.write(`${JSON.stringify(restored)}\n`);
  else
    process.stderr.write(
      'Verified main coverage proof unavailable; full release coverage will run.\n'
    );
}
