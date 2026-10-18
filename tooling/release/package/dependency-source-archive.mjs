import path from 'node:path';
import JSZip from 'jszip';
import { readProofInput } from '../../qa/proof/contracts/proof-input.mjs';
import {
  collectReleaseLegalSourceFiles,
  dependencySourceArchiveIdentity,
  readOssReleasePolicy,
  sha256,
} from '../policy/oss-release-policy.mjs';

const SOURCE_FILES = [
  'LICENSE',
  'README.md',
  'patch-manifest.json',
  'patch-payload.json.gz',
  'source.patch',
];
const ARCHIVE_DATE = new Date('1980-01-01T00:00:00.000Z');

/** Packages the exact checked modifications separately from the installable extension. */
export async function createDependencySourceArchive(repoRoot = process.cwd()) {
  const policy = readOssReleasePolicy(repoRoot);
  const roots = new Set(
    policy.legalFiles
      .filter((entry) => entry.distribution === 'source')
      .map((entry) => path.posix.dirname(entry.archivePath))
  );
  if (!roots.size) throw new Error('Modified dependency source inventory is missing.');
  for (const root of roots) {
    if (
      !root.startsWith('LICENSES/dependencies/') ||
      root.includes('\\') ||
      root.split('/').some((part) => part === '..' || !part)
    )
      throw new Error('Unsafe modified dependency source path.');
  }
  const files = (await collectReleaseLegalSourceFiles(repoRoot, { includeSource: true })).filter(
    (entry) => roots.has(path.posix.dirname(entry.relativePath))
  );
  const expected = [...roots]
    .flatMap((root) => SOURCE_FILES.map((name) => `${root}/${name}`))
    .sort();
  if (JSON.stringify(files.map((entry) => entry.relativePath).sort()) !== JSON.stringify(expected))
    throw new Error('Modified dependency source inventory is not exact.');
  const zip = new JSZip();
  for (const file of files.sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath)
  )) {
    zip.file(file.relativePath, file.contents, { createFolders: false, date: ARCHIVE_DATE });
  }
  const contents = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
    platform: 'UNIX',
  });
  return { ...dependencySourceArchiveIdentity(repoRoot), contents, sha256: sha256(contents) };
}

/** Binds the prepared archive bytes to the exact source checkout and checked legal inputs. */
export async function verifyDependencySourceArchive(assetRoot, repoRoot = process.cwd()) {
  const expected = await createDependencySourceArchive(repoRoot);
  if (sha256(readProofInput(path.join(assetRoot, expected.file))) !== expected.sha256)
    throw new Error('Modified dependency source archive digest mismatch.');
  return { file: expected.file, sha256: expected.sha256 };
}
