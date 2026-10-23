import fs from 'node:fs/promises';
import path from 'node:path';
import { normalizeMediabunny } from '../../ci/mediabunny/normalize.mjs';
import { dependencySourceArchiveIdentity, sha256 } from '../policy/oss-release-policy.mjs';

const OWNER = 'tooling/ci/mediabunny';
const FILES = ['patch-payload.json.gz', 'patch-manifest.json', 'source.patch', 'LICENSE'];

async function readOwnedFile(root, relative) {
  const absolute = path.resolve(root, relative);
  const canonicalRoot = await fs.realpath(root);
  const canonicalFile = await fs.realpath(absolute);
  if (!canonicalFile.startsWith(`${canonicalRoot}${path.sep}`)) {
    throw new Error(`Modified dependency source escapes the repository: ${relative}`);
  }
  const handle = await fs.open(canonicalFile, 'r');
  try {
    if (!(await handle.stat()).isFile()) {
      throw new Error(`Modified dependency source is not a regular file: ${relative}`);
    }
    return await handle.readFile();
  } finally {
    await handle.close();
  }
}

function instructions(record, manifest, archive) {
  return [
    '# Modified Mediabunny corresponding source\n\nThis archive accompanies Mediabunny ',
    String(record.version),
    ', licensed MPL-2.0. Preserve LICENSE and the original source headers. Sniptale ',
    `distributes the corresponding modifications in [${archive.file}](${archive.url}). `,
    'The payload and reconstruction files below are inside that separate source archive. ',
    'Sniptale adds an optional validated 48 kHz processed-audio window for AAC fragmented MP4 ',
    'and Opus WebM; Opus pre-skip is derived from decoder configuration. The changed ',
    'TypeScript files are listed in patch-manifest.json and included in full in ',
    'patch-payload.json.gz. source.patch is the reviewable source delta.\n\nUnmodified ',
    'upstream source: ',
    String(record.resolved),
    '\n\nUpstream package integrity: ',
    String(record.integrity),
    '\n\nThe upstream tarball alone is not the modified corresponding source. Combine ',
    'it with these supplied modifications. patch-payload.json.gz is gzip-compressed ',
    'UTF-8 JSON: keys are package-relative paths, values are full replacement text. ',
    'It includes all modified TypeScript sources, declarations and distribution ',
    "bundles. Decode it with Node's gunzipSync and JSON.parse; inspect the src/ ",
    'entries directly. To reconstruct the exact installed package, extract the ',
    'integrity-verified upstream tarball, check every target against beforeSha256 in ',
    'patch-manifest.json, write the corresponding replacement text, and verify every ',
    'resulting afterSha256. Do not evaluate the JSON text as JavaScript. Paths must ',
    'remain within the extracted package. A completely reconstructed package must ',
    'match all manifest result hashes.\n\nThe manifest also binds the compressed ',
    'payload, source patch and license hashes. Rebuild provenance: Node ',
    String(manifest.tooling.node),
    ', TypeScript ',
    String(manifest.tooling.typescript),
    ', esbuild ',
    String(manifest.tooling.esbuild),
    '. Sources were compiled as ES2022/ESNext with explicit relative .js imports; ',
    'declarations/maps were emitted using the shipped shared declarations; all ',
    'browser and Node bundles were rebuilt from the ESM index, preserving the browser ',
    'Node/fs exclusion. The complete replacement distribution is supplied so ',
    'reconstruction does not require a compiler download. No runtime monkey patch or ',
    'separate muxer is required.\n',
  ].join('');
}

/** Adds exact, locally distributed modifications to the upstream corresponding-source identity. */
export async function selectModifiedDependencySource(record, policies = []) {
  const policy = policies.find(
    (entry) => entry.packageName === record.packageName && entry.version === record.version
  );
  if (!policy) return null;
  if (
    record.packageName !== 'mediabunny' ||
    record.version !== '1.61.3' ||
    policy.owner !== OWNER ||
    Object.keys(policy).sort().join(',') !== 'owner,packageName,version'
  ) {
    throw new Error('Unsupported modified dependency source policy.');
  }
  normalizeMediabunny({ root: record.repoRoot, check: true });
  const sourceContents = await Promise.all(
    FILES.map((file) => readOwnedFile(record.repoRoot, `${OWNER}/${file}`))
  );
  const manifest = JSON.parse(sourceContents[1].toString('utf8'));
  if (
    manifest.resolved !== record.resolved ||
    manifest.integrity !== record.integrity ||
    manifest.version !== record.version ||
    manifest.package !== record.packageName ||
    sha256(sourceContents[0]) !== manifest.payload.sha256 ||
    sha256(sourceContents[2]) !== manifest.sourcePatchSha256 ||
    sha256(sourceContents[3]) !== manifest.license.sha256
  ) {
    throw new Error('Modified dependency source identity drift.');
  }
  const archiveRoot = `LICENSES/dependencies/mediabunny-${record.version}-modified`;
  const archive = dependencySourceArchiveIdentity(record.repoRoot);
  const sourceFiles = FILES.map((file, index) => ({
    archivePath: `${archiveRoot}/${file}`,
    contents: sourceContents[index],
  }));
  sourceFiles.push({
    archivePath: `${archiveRoot}/README.md`,
    contents: Buffer.from(instructions(record, manifest, archive)),
  });
  return {
    metadata: {
      archive,
      upstreamIntegrity: record.integrity,
      files: sourceFiles.map((file) => ({
        archivePath: file.archivePath,
        sha256: sha256(file.contents),
      })),
    },
    sourceFiles,
  };
}
