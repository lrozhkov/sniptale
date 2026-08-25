import fs from 'node:fs';
import path from 'node:path';

import JSZip from 'jszip';

import { readProofInput, sha256ProofInput as sha256Bytes } from '../qa/core/proof-input.mjs';
import { verifyReleaseProof } from './verify-main-proof.mjs';
import { collectProofEvidenceSources } from './release-evidence.mjs';

const ARCHIVE_FILE_DATE = new Date('1980-01-01T00:00:00.000Z');

function requireRegularFile(file, label) {
  try {
    return readProofInput(file);
  } catch (cause) {
    throw new Error(`Missing or unsafe ${label}: ${file}`, { cause });
  }
}

async function writeEvidenceArchive(output, archiveName, sources, identity) {
  const entries = new Map();
  for (const [name, source] of sources) {
    if (entries.has(name)) throw new Error(`Release evidence collision: ${name}`);
    entries.set(name, requireRegularFile(source, 'release evidence'));
  }
  const manifest = {
    schemaVersion: 1,
    artifactKind: 'sniptale-release-qa-evidence',
    ...identity,
    files: [...entries]
      .map(([file, contents]) => ({ file, sha256: sha256Bytes(contents) }))
      .sort((left, right) => left.file.localeCompare(right.file)),
  };
  entries.set('manifest.json', Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`));
  const zip = new JSZip();
  for (const [name, contents] of [...entries].sort(([left], [right]) =>
    left.localeCompare(right)
  )) {
    zip.file(name, contents, { createFolders: false, date: ARCHIVE_FILE_DATE });
  }
  const archive = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
    platform: 'UNIX',
  });
  fs.writeFileSync(path.join(output, archiveName), archive, { flag: 'wx' });
  return sha256Bytes(archive);
}

const [artifactRoot, releaseCommit] = process.argv.slice(2);
if (!artifactRoot || !releaseCommit || !fs.statSync(artifactRoot).isDirectory()) {
  throw new Error('Usage: prepare-release-assets.mjs <release-proof-root> <commit>');
}
const releaseRoot = path.resolve(artifactRoot);
const output = path.join(releaseRoot, 'release-assets');
fs.mkdirSync(output, { recursive: false });
const verified = verifyReleaseProof(releaseRoot, releaseCommit);
const extensionZip = path.join(releaseRoot, verified.zipFile);
const extensionZipName = path.basename(extensionZip);
const sbom = path.join(releaseRoot, '.tmp/licenses/sbom.cdx.json');
const proofManifest = path.join(releaseRoot, 'proof-manifest.json');
const evidenceName = `${path.basename(extensionZipName, '.zip')}-qa-evidence.zip`;

for (const [source, name] of [
  [extensionZip, extensionZipName],
  [sbom, 'sbom.cdx.json'],
]) {
  fs.writeFileSync(path.join(output, name), requireRegularFile(source, 'release asset'), {
    flag: 'wx',
  });
}

const evidenceSources = collectProofEvidenceSources(releaseRoot, verified.manifest, {
  excludedFiles: [verified.zipFile, '.tmp/licenses/sbom.cdx.json'],
});
const proofSha256 = sha256Bytes(requireRegularFile(proofManifest, 'release proof'));
const evidenceSha256 = await writeEvidenceArchive(output, evidenceName, evidenceSources, {
  commit: releaseCommit,
  releaseProofSha256: proofSha256,
});

const provenance = {
  schemaVersion: 2,
  artifactKind: 'sniptale-release-provenance',
  commit: releaseCommit,
  releaseProofSha256: proofSha256,
  qaEvidence: { file: evidenceName, sha256: evidenceSha256 },
};
fs.writeFileSync(path.join(output, 'provenance.json'), `${JSON.stringify(provenance, null, 2)}\n`, {
  flag: 'wx',
});

const releaseAssets = fs
  .readdirSync(output, { withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => entry.name)
  .sort();
if (releaseAssets.length !== 4) throw new Error('Release asset staging inventory drifted.');
const sums = releaseAssets.map(
  (name) => `${sha256Bytes(fs.readFileSync(path.join(output, name)))}  ${name}`
);
fs.writeFileSync(path.join(output, 'SHA256SUMS'), `${sums.join('\n')}\n`, { flag: 'wx' });
process.stdout.write(`${output}\n`);
