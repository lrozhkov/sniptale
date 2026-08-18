import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { verifyMainProof } from './verify-main-proof.mjs';

const artifactRoot = process.argv[2];
if (!artifactRoot || !fs.statSync(artifactRoot).isDirectory()) {
  throw new Error(
    'Usage: prepare-release-assets.mjs <main-proof-root> <release-audit-root> <commit>'
  );
}
const releaseAuditRoot = process.argv[3] ? path.resolve(process.argv[3]) : null;
const releaseCommit = process.argv[4];
if (
  releaseAuditRoot &&
  (!fs.existsSync(releaseAuditRoot) || !fs.statSync(releaseAuditRoot).isDirectory())
) {
  throw new Error('Release audit artifact directory is missing.');
}
const output = path.join(artifactRoot, 'release-assets');
fs.mkdirSync(output, { recursive: false });
const verifiedMainProof = verifyMainProof(path.resolve(artifactRoot), releaseCommit);
const sources = [
  path.join(artifactRoot, verifiedMainProof.zipFile),
  path.join(artifactRoot, '.tmp/licenses/sbom.cdx.json'),
  path.join(artifactRoot, 'proof-manifest.json'),
];
const releaseAuditSources = releaseAuditRoot
  ? [
      ['codeql.sarif', '.tmp/codeql/results.filtered.sarif'],
      ['semgrep.sarif', '.tmp/semgrep/results.sarif'],
      ['lcov.info', '.tmp/coverage/canonical/lcov.info'],
      ['coverage-final.json', '.tmp/coverage/canonical/coverage-final.json'],
      ['coverage-summary.json', '.tmp/coverage/canonical/coverage-summary.json'],
      ['coverage-proof.json', '.tmp/qa/coverage-proof.json'],
      ['codeql-proof.json', '.tmp/qa/codeql-proof.json'],
    ]
  : [];
const releaseAuditProof = releaseAuditRoot
  ? path.join(releaseAuditRoot, 'proof-manifest.json')
  : null;
const names = new Set();
for (const source of sources) {
  if (!fs.existsSync(source) || !fs.statSync(source).isFile())
    throw new Error(`Missing release asset: ${source}`);
  const name = path.basename(source);
  if (names.has(name)) throw new Error(`Release asset collision: ${name}`);
  names.add(name);
  fs.copyFileSync(source, path.join(output, name), fs.constants.COPYFILE_EXCL);
}
if (releaseAuditProof) {
  const name = 'release-audit-proof-manifest.json';
  if (!fs.existsSync(releaseAuditProof) || names.has(name)) {
    throw new Error(`Missing or colliding release audit proof: ${releaseAuditProof}`);
  }
  names.add(name);
  fs.copyFileSync(releaseAuditProof, path.join(output, name), fs.constants.COPYFILE_EXCL);
}
for (const [name, relative] of releaseAuditSources) {
  const source = path.join(releaseAuditRoot, relative);
  if (!fs.existsSync(source) || !fs.statSync(source).isFile() || names.has(name)) {
    throw new Error(`Missing or colliding release audit asset: ${relative}`);
  }
  names.add(name);
  fs.copyFileSync(source, path.join(output, name), fs.constants.COPYFILE_EXCL);
}
if (releaseAuditRoot) {
  const htmlRoot = path.join(releaseAuditRoot, '.tmp/coverage/canonical/html');
  const htmlArchive = path.join(output, 'coverage-html.tar.gz');
  const archived = spawnSync('tar', ['-czf', htmlArchive, '-C', htmlRoot, '.'], {
    encoding: 'utf8',
  });
  if (archived.status !== 0)
    throw new Error(`Unable to archive coverage HTML: ${archived.stderr.trim()}`);
  names.add('coverage-html.tar.gz');
}
const provenance = {
  schemaVersion: 1,
  artifactKind: 'sniptale-release-provenance',
  commit: releaseCommit,
  mainProofSha256: crypto
    .createHash('sha256')
    .update(fs.readFileSync(path.join(artifactRoot, 'proof-manifest.json')))
    .digest('hex'),
  releaseAuditProofSha256: releaseAuditProof
    ? crypto.createHash('sha256').update(fs.readFileSync(releaseAuditProof)).digest('hex')
    : null,
};
fs.writeFileSync(path.join(output, 'provenance.json'), `${JSON.stringify(provenance, null, 2)}\n`, {
  flag: 'wx',
});
names.add('provenance.json');
const sums = [...names].sort().map(
  (name) =>
    `${crypto
      .createHash('sha256')
      .update(fs.readFileSync(path.join(output, name)))
      .digest('hex')}  ${name}`
);
fs.writeFileSync(path.join(output, 'SHA256SUMS'), `${sums.join('\n')}\n`, { flag: 'wx' });
process.stdout.write(`${output}\n`);
