/**
 * Packages the current dist/ contents into a deterministic release archive.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import JSZip from 'jszip';

import { verifyReleaseArchivePath, verifyReleaseArtifactFiles } from './artifact-security.mjs';
import { collectReleaseLegalSourceFiles } from './oss-release-policy.mjs';

const ARCHIVE_FILE_DATE = new Date('1980-01-01T00:00:00.000Z');
const MAX_RELEASE_ARCHIVE_FILE_BYTES = 50 * 1024 * 1024;
const FORBIDDEN_ARCHIVE_PATH_PATTERNS = [
  /\.map$/u,
  /(?:^|\/)\.env(?:\.|$)/u,
  /(?:^|\/)(?:raw-diagnostics|raw-history|secret|private-key|token)[^/]*$/iu,
];

export function formatBuildDate(date) {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function normalizeArchiveSegment(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export async function collectDistFiles(directory, options = {}, relativeDirectory = '') {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  const excludedPaths = options.excludedPaths ?? new Set();

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const absolutePath = path.join(directory, entry.name);
    const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;

    if (excludedPaths.has(absolutePath)) {
      continue;
    }

    if (entry.isDirectory()) {
      files.push(...(await collectDistFiles(absolutePath, options, relativePath)));
      continue;
    }

    if (entry.isFile()) {
      files.push({ absolutePath, relativePath });
    }
  }

  return files;
}

export async function readPackageMetadata(repoRoot) {
  const packageJsonPath = path.join(repoRoot, 'package.json');
  const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
  return {
    name: normalizeArchiveSegment(String(packageJson.name ?? 'app')),
    version: String(packageJson.version ?? '0.0.0'),
  };
}

function collectManifestEntrypoints(value, paths = []) {
  if (typeof value === 'string') {
    paths.push(value);
    return paths;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectManifestEntrypoints(item, paths);
    }
    return paths;
  }
  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (/(?:service_worker|scripts|default_popup|default_icon|icons|js|css|pages?)$/u.test(key)) {
        collectManifestEntrypoints(item, paths);
      } else if (
        key === 'content_scripts' ||
        key === 'action' ||
        key === 'background' ||
        key === 'sandbox'
      ) {
        collectManifestEntrypoints(item, paths);
      }
    }
  }
  return paths;
}

function assertSafeReleaseArchiveFile(file, contents) {
  if (FORBIDDEN_ARCHIVE_PATH_PATTERNS.some((pattern) => pattern.test(file.relativePath))) {
    throw new Error(`Release archive contains forbidden file: ${file.relativePath}`);
  }
  if (contents.byteLength > MAX_RELEASE_ARCHIVE_FILE_BYTES) {
    throw new Error(`Release archive file is unexpectedly large: ${file.relativePath}`);
  }
}

async function validateReleaseArchiveInputs(files) {
  const filesByPath = new Map(files.map((file) => [file.relativePath, file]));
  const manifestFile = filesByPath.get('manifest.json');
  if (!manifestFile) {
    throw new Error('Release archive is missing manifest.json.');
  }

  let manifest;
  try {
    manifest = JSON.parse(await fs.readFile(manifestFile.absolutePath, 'utf8'));
  } catch {
    throw new Error('Release archive manifest.json is not valid JSON.');
  }
  if (manifest.manifest_version !== 3) {
    throw new Error('Release archive manifest.json must be Manifest V3.');
  }

  for (const entrypoint of collectManifestEntrypoints(manifest)) {
    if (/^(?:https?:|chrome:|data:)/u.test(entrypoint)) {
      continue;
    }
    if (!filesByPath.has(entrypoint)) {
      throw new Error(`Release archive manifest references missing file: ${entrypoint}`);
    }
  }
}

export async function createReleaseArchive({ date = new Date(), repoRoot = process.cwd() } = {}) {
  const distDir = path.join(repoRoot, 'dist');
  const releaseDir = path.join(repoRoot, 'build');
  const { name, version } = await readPackageMetadata(repoRoot);
  const archiveName = `${name}_${version}_${formatBuildDate(date)}.zip`;
  const archivePath = path.join(releaseDir, archiveName);
  const distFiles = await collectDistFiles(distDir, { excludedPaths: new Set([archivePath]) });
  const legalFiles = await collectReleaseLegalSourceFiles(repoRoot);
  const files = [...distFiles, ...legalFiles];

  if (distFiles.length === 0) {
    throw new Error('dist/ is empty. Run the release build before packaging.');
  }
  const duplicatePaths = files
    .map((file) => file.relativePath)
    .filter((relativePath, index, paths) => paths.indexOf(relativePath) !== index);
  if (duplicatePaths.length > 0) {
    throw new Error(`Release archive path collision: ${[...new Set(duplicatePaths)].join(', ')}`);
  }
  await validateReleaseArchiveInputs(files);

  const archiveFiles = [];
  const zip = new JSZip();

  for (const file of files) {
    const contents = await fs.readFile(file.absolutePath);
    assertSafeReleaseArchiveFile(file, contents);
    archiveFiles.push({ ...file, contents });
    zip.file(file.relativePath, contents, {
      date: ARCHIVE_FILE_DATE,
    });
  }

  await verifyReleaseArtifactFiles({ files: archiveFiles, repoRoot });

  await fs.mkdir(releaseDir, { recursive: true });
  await fs.writeFile(
    archivePath,
    await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 9 },
    })
  );
  await verifyReleaseArchivePath(archivePath, { repoRoot });

  return archivePath;
}

async function main() {
  const archivePath = await createReleaseArchive();
  process.stdout.write(`Release archive: ${archivePath}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
