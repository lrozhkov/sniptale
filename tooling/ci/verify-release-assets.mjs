import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { isExecutedAsScript } from '../qa/runtime/process/shared-cli.mjs';
import { verifyReleaseProof } from './verify-main-proof.mjs';

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function requireRegularFile(file) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`Release asset is not a regular file: ${file}`);
  }
}

function parseChecksums(file) {
  const entries = new Map();
  for (const line of fs.readFileSync(file, 'utf8').trimEnd().split('\n')) {
    const match = line.match(/^([a-f0-9]{64}) {2}([A-Za-z0-9._-]+)$/u);
    if (!match || entries.has(match[2])) throw new Error('Release asset checksums are malformed.');
    entries.set(match[2], match[1]);
  }
  return entries;
}

export function verifyPreparedReleaseAssets({
  releaseRoot,
  commit,
  verifyProof = verifyReleaseProof,
}) {
  const verified = verifyProof(releaseRoot, commit);
  const assetRoot = path.join(releaseRoot, 'release-assets');
  const zipName = path.basename(verified.zipFile);
  const evidenceName = `${path.basename(zipName, '.zip')}-qa-evidence.zip`;
  const subjectNames = [zipName, evidenceName, 'provenance.json', 'sbom.cdx.json'].sort();
  const expectedNames = [...subjectNames, 'SHA256SUMS'].sort();
  const actualNames = fs.readdirSync(assetRoot).sort();
  if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) {
    throw new Error('Prepared release asset inventory is not exact.');
  }
  for (const name of actualNames) requireRegularFile(path.join(assetRoot, name));
  const checksums = parseChecksums(path.join(assetRoot, 'SHA256SUMS'));
  if (JSON.stringify([...checksums.keys()].sort()) !== JSON.stringify(subjectNames)) {
    throw new Error('Prepared release checksum subject inventory is not exact.');
  }
  for (const [name, expected] of checksums) {
    if (sha256(path.join(assetRoot, name)) !== expected) {
      throw new Error(`Prepared release asset digest mismatch: ${name}`);
    }
  }
  const proofSha256 = sha256(path.join(releaseRoot, 'proof-manifest.json'));
  const provenance = JSON.parse(fs.readFileSync(path.join(assetRoot, 'provenance.json'), 'utf8'));
  if (
    provenance.schemaVersion !== 2 ||
    provenance.artifactKind !== 'sniptale-release-provenance' ||
    provenance.commit !== commit ||
    provenance.releaseProofSha256 !== proofSha256 ||
    provenance.qaEvidence?.file !== evidenceName ||
    provenance.qaEvidence?.sha256 !== checksums.get(evidenceName)
  ) {
    throw new Error('Prepared release provenance does not bind the admitted proof and evidence.');
  }
  return { assetRoot, subjectNames: expectedNames };
}

if (isExecutedAsScript(import.meta.url)) {
  const [releaseRoot, commit] = process.argv.slice(2);
  if (!releaseRoot || !/^[a-f0-9]{40}$/u.test(commit ?? '')) {
    throw new Error('Usage: verify-release-assets.mjs <release-proof-root> <commit>');
  }
  process.stdout.write(`${JSON.stringify(verifyPreparedReleaseAssets({ releaseRoot, commit }))}\n`);
}
