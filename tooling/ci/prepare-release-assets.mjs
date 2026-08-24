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

function escapeSvg(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function writeBadge(output, name, label, value, color) {
  const leftWidth = Math.max(36, label.length * 7 + 12);
  const rightWidth = Math.max(36, String(value).length * 7 + 12);
  const width = leftWidth + rightWidth;
  const safeLabel = escapeSvg(label);
  const safeValue = escapeSvg(value);
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="20" role="img" aria-label="${safeLabel}: ${safeValue}">`,
    '<linearGradient id="s" x2="0" y2="100%">',
    '<stop offset="0" stop-color="#bbb" stop-opacity=".1"/>',
    '<stop offset="1" stop-opacity=".1"/></linearGradient>',
    `<clipPath id="r"><rect width="${width}" height="20" rx="3" fill="#fff"/></clipPath>`,
    `<g clip-path="url(#r)"><rect width="${leftWidth}" height="20" fill="#555"/>`,
    `<rect x="${leftWidth}" width="${rightWidth}" height="20" fill="${color}"/>`,
    `<rect width="${width}" height="20" fill="url(#s)"/></g>`,
    '<g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">',
    `<text x="${leftWidth / 2}" y="15" fill="#010101" fill-opacity=".3">${safeLabel}</text>`,
    `<text x="${leftWidth / 2}" y="14">${safeLabel}</text>`,
    `<text x="${leftWidth + rightWidth / 2}" y="15" fill="#010101" fill-opacity=".3">${safeValue}</text>`,
    `<text x="${leftWidth + rightWidth / 2}" y="14">${safeValue}</text>`,
    '</g></svg>\n',
  ].join('');
  fs.writeFileSync(path.join(output, name), svg, { flag: 'wx' });
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

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const extensionManifest = JSON.parse(fs.readFileSync('apps/extension/manifest.json', 'utf8'));
const coverageSummary = JSON.parse(
  fs.readFileSync(path.join(releaseRoot, '.tmp/coverage/canonical/coverage-summary.json'), 'utf8')
);
const coverage = coverageSummary.total?.lines?.pct;
if (!Number.isFinite(coverage)) throw new Error('Canonical line coverage is unavailable.');
writeBadge(output, 'ci.svg', 'CI', 'passing', '#2cbe4e');
writeBadge(output, 'coverage.svg', 'coverage', `${coverage}%`, '#2cbe4e');
writeBadge(output, 'release.svg', 'release', `v${extensionManifest.version_name}`, '#007ec6');
writeBadge(output, 'license.svg', 'license', packageJson.license, '#007ec6');

const releaseAssets = fs
  .readdirSync(output, { withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => entry.name)
  .sort();
if (releaseAssets.length !== 8) throw new Error('Release asset staging inventory drifted.');
const sums = releaseAssets.map(
  (name) => `${sha256Bytes(fs.readFileSync(path.join(output, name)))}  ${name}`
);
fs.writeFileSync(path.join(output, 'SHA256SUMS'), `${sums.join('\n')}\n`, { flag: 'wx' });
process.stdout.write(`${output}\n`);
