import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

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
const sums = [...names].sort().map(
  (name) =>
    `${crypto
      .createHash('sha256')
      .update(fs.readFileSync(path.join(output, name)))
      .digest('hex')}  ${name}`
);
fs.writeFileSync(path.join(output, 'SHA256SUMS'), `${sums.join('\n')}\n`, { flag: 'wx' });
process.stdout.write(`${output}\n`);
