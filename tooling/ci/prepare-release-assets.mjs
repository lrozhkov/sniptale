import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import JSZip from 'jszip';

import { verifyMainProof } from './verify-main-proof.mjs';

const ARCHIVE_FILE_DATE = new Date('1980-01-01T00:00:00.000Z');

function sha256Bytes(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function requireRegularFile(file, label) {
  if (!fs.existsSync(file)) throw new Error(`Missing ${label}: ${file}`);
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Unsafe ${label}: ${file}`);
  return fs.readFileSync(file);
}

function collectTree(root, archiveRoot) {
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    throw new Error(`Missing release evidence directory: ${root}`);
  }
  const files = [];
  function walk(directory, relativeDirectory = '') {
    for (const entry of fs
      .readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name))) {
      const absolute = path.join(directory, entry.name);
      const relative = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) throw new Error(`Unsafe release evidence symlink: ${absolute}`);
      if (entry.isDirectory()) walk(absolute, relative);
      else if (entry.isFile()) files.push([`${archiveRoot}/${relative}`, absolute]);
      else throw new Error(`Unsafe release evidence entry: ${absolute}`);
    }
  }
  walk(root);
  return files;
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

const artifactRoot = process.argv[2];
if (!artifactRoot || !fs.statSync(artifactRoot).isDirectory()) {
  throw new Error(
    'Usage: prepare-release-assets.mjs <main-proof-root> <release-audit-root> <commit>'
  );
}
const releaseAuditRoot = process.argv[3] ? path.resolve(process.argv[3]) : null;
const releaseCommit = process.argv[4];
if (
  !releaseAuditRoot ||
  !fs.existsSync(releaseAuditRoot) ||
  !fs.statSync(releaseAuditRoot).isDirectory()
) {
  throw new Error('Release audit artifact directory is missing.');
}

const mainRoot = path.resolve(artifactRoot);
const output = path.join(mainRoot, 'release-assets');
fs.mkdirSync(output, { recursive: false });
const verifiedMainProof = verifyMainProof(mainRoot, releaseCommit);
const extensionZip = path.join(mainRoot, verifiedMainProof.zipFile);
const extensionZipName = path.basename(extensionZip);
const sbom = path.join(mainRoot, '.tmp/licenses/sbom.cdx.json');
const mainProof = path.join(mainRoot, 'proof-manifest.json');
const releaseAuditProof = path.join(releaseAuditRoot, 'proof-manifest.json');
const evidenceName = `qa-evidence-${extensionZipName}`;

for (const [source, name] of [
  [extensionZip, extensionZipName],
  [sbom, 'sbom.cdx.json'],
]) {
  requireRegularFile(source, 'release asset');
  fs.copyFileSync(source, path.join(output, name), fs.constants.COPYFILE_EXCL);
}

const evidenceSources = [
  ['proof/main-proof-manifest.json', mainProof],
  ['proof/release-audit-proof-manifest.json', releaseAuditProof],
  ['security/codeql.sarif', path.join(releaseAuditRoot, '.tmp/codeql/results.filtered.sarif')],
  ['security/semgrep.sarif', path.join(releaseAuditRoot, '.tmp/semgrep/results.sarif')],
  ['coverage/lcov.info', path.join(releaseAuditRoot, '.tmp/coverage/canonical/lcov.info')],
  [
    'coverage/coverage-final.json',
    path.join(releaseAuditRoot, '.tmp/coverage/canonical/coverage-final.json'),
  ],
  [
    'coverage/coverage-summary.json',
    path.join(releaseAuditRoot, '.tmp/coverage/canonical/coverage-summary.json'),
  ],
  ['proof/coverage-proof.json', path.join(releaseAuditRoot, '.tmp/qa/coverage-proof.json')],
  ['proof/codeql-proof.json', path.join(releaseAuditRoot, '.tmp/qa/codeql-proof.json')],
  ...collectTree(path.join(releaseAuditRoot, '.tmp/coverage/canonical/html'), 'coverage/html'),
];
const releaseAuditManifest = JSON.parse(
  requireRegularFile(releaseAuditProof, 'release audit proof')
);
if (
  releaseAuditManifest.schemaVersion !== 1 ||
  releaseAuditManifest.artifactKind !== 'sniptale-ci-proof' ||
  releaseAuditManifest.lane !== 'release-audit' ||
  releaseAuditManifest.status !== 'passed' ||
  releaseAuditManifest.commit !== releaseCommit
) {
  throw new Error('Release audit proof identity does not match the release commit.');
}
const releaseAuditDigests = new Map(
  releaseAuditManifest.files.map(({ file, sha256 }) => [file, sha256])
);
const releaseAuditChecksums = new Map(
  requireRegularFile(path.join(releaseAuditRoot, 'SHA256SUMS'), 'release audit checksums')
    .toString('utf8')
    .trim()
    .split('\n')
    .map((line) => {
      const match = /^([a-f0-9]{64}) {2}(.+)$/u.exec(line);
      if (!match) throw new Error(`Malformed release audit checksum: ${line}`);
      return [match[2], match[1]];
    })
);
if (
  releaseAuditChecksums.get('proof-manifest.json') !==
  sha256Bytes(fs.readFileSync(releaseAuditProof))
) {
  throw new Error('Release audit proof checksum drifted.');
}
for (const [, source] of evidenceSources.filter(([, source]) =>
  source.startsWith(releaseAuditRoot)
)) {
  const relative = path.relative(releaseAuditRoot, source).replaceAll(path.sep, '/');
  const digest = sha256Bytes(requireRegularFile(source, 'release audit evidence'));
  if (relative === 'proof-manifest.json') continue;
  if (
    releaseAuditDigests.get(relative) !== digest ||
    releaseAuditChecksums.get(relative) !== digest
  ) {
    throw new Error(`Release audit evidence digest drifted: ${relative}`);
  }
}
const evidenceSha256 = await writeEvidenceArchive(output, evidenceName, evidenceSources, {
  commit: releaseCommit,
  mainProofSha256: sha256Bytes(requireRegularFile(mainProof, 'main proof')),
  releaseAuditProofSha256: sha256Bytes(
    requireRegularFile(releaseAuditProof, 'release audit proof')
  ),
});

const provenance = {
  schemaVersion: 1,
  artifactKind: 'sniptale-release-provenance',
  commit: releaseCommit,
  mainProofSha256: sha256Bytes(fs.readFileSync(mainProof)),
  releaseAuditProofSha256: sha256Bytes(fs.readFileSync(releaseAuditProof)),
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
