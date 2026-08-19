import fs from 'node:fs';
import path from 'node:path';

import { isExecutedAsScript } from '../qa/core/shared.mjs';
import { readProofInput, sha256ProofInput } from '../qa/core/proof-input.mjs';
import { parseSha256Sums } from './release-checksums.mjs';

const LCOV_PATH = '.tmp/coverage/canonical/lcov.info';

export function selectReleaseCoverage(artifactRoot, commit, destination) {
  if (!/^[a-f0-9]{40}$/u.test(commit ?? '')) throw new Error('Expected a full release SHA.');
  const root = path.resolve(artifactRoot);
  const manifestPath = path.join(root, 'proof-manifest.json');
  const manifestBytes = readProofInput(manifestPath);
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  if (
    manifest.schemaVersion !== 1 ||
    manifest.artifactKind !== 'sniptale-ci-proof' ||
    manifest.lane !== 'release-audit' ||
    manifest.status !== 'passed' ||
    manifest.commit !== commit ||
    !/^sha256:[a-f0-9]{64}$/u.test(manifest.containerDigest ?? '')
  ) {
    throw new Error('Release coverage proof identity does not match the published commit.');
  }
  const files = new Map(manifest.files.map((entry) => [entry.file, entry.sha256]));
  const checksums = parseSha256Sums(readProofInput(path.join(root, 'SHA256SUMS')), 'release audit');
  const source = path.join(root, LCOV_PATH);
  const sourceBytes = readProofInput(source);
  const digest = sha256ProofInput(sourceBytes);
  if (
    files.get(LCOV_PATH) !== digest ||
    checksums.get(LCOV_PATH) !== digest ||
    checksums.get('proof-manifest.json') !== sha256ProofInput(manifestBytes)
  ) {
    throw new Error('Release LCOV report or proof digest drifted.');
  }
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, sourceBytes, { flag: 'wx' });
  return { commit, lcov: path.resolve(destination), sha256: digest };
}

if (isExecutedAsScript(import.meta.url)) {
  const [artifactRoot, commit, destination] = process.argv.slice(2);
  if (!artifactRoot || !commit || !destination) {
    throw new Error(
      'Usage: select-release-coverage.mjs <release-audit-root> <commit> <destination>'
    );
  }
  process.stdout.write(
    `${JSON.stringify(selectReleaseCoverage(artifactRoot, commit, destination))}\n`
  );
}
