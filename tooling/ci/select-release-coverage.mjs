import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { isExecutedAsScript } from '../qa/core/shared.mjs';

const LCOV_PATH = '.tmp/coverage/canonical/lcov.info';

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function readChecksums(file) {
  return new Map(
    fs
      .readFileSync(file, 'utf8')
      .trim()
      .split('\n')
      .map((line) => {
        const match = /^([a-f0-9]{64}) {2}(.+)$/u.exec(line);
        if (!match) throw new Error(`Malformed release audit checksum: ${line}`);
        return [match[2], match[1]];
      })
  );
}

export function selectReleaseCoverage(artifactRoot, commit, destination) {
  if (!/^[a-f0-9]{40}$/u.test(commit ?? '')) throw new Error('Expected a full release SHA.');
  const root = path.resolve(artifactRoot);
  const manifestPath = path.join(root, 'proof-manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
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
  const checksums = readChecksums(path.join(root, 'SHA256SUMS'));
  const source = path.join(root, LCOV_PATH);
  const details = fs.lstatSync(source);
  if (!details.isFile() || details.isSymbolicLink()) throw new Error('Unsafe release LCOV report.');
  const digest = sha256(source);
  if (
    files.get(LCOV_PATH) !== digest ||
    checksums.get(LCOV_PATH) !== digest ||
    checksums.get('proof-manifest.json') !== sha256(manifestPath)
  ) {
    throw new Error('Release LCOV report or proof digest drifted.');
  }
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
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
