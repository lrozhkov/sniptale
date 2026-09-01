/**
 * Packages the current dist/ contents into a deterministic release archive.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import JSZip from 'jszip';

import {
  getForbiddenReleaseArtifactPathReason,
  verifyReleaseArchivePath,
  verifyReleaseArtifactFiles,
} from '../artifact-security/artifact-security.mjs';
import { collectReleaseLegalSourceFiles } from '../policy/oss-release-policy.mjs';

const ARCHIVE_FILE_DATE = new Date('1980-01-01T00:00:00.000Z');
const MAX_RELEASE_ARCHIVE_FILE_BYTES = 50 * 1024 * 1024;
const SEMVER_NUMERIC_IDENTIFIER = /^(?:0|[1-9][0-9]*)$/u;
const SEMVER_IDENTIFIER = /^[0-9A-Za-z-]+$/u;

function isCanonicalSemVer(version) {
  const [versionAndPrerelease, ...buildParts] = version.split('+');
  if (buildParts.length > 1) return false;
  const [core, ...prereleaseParts] = versionAndPrerelease.split('-');
  const coreIdentifiers = core.split('.');
  if (
    coreIdentifiers.length !== 3 ||
    !coreIdentifiers.every((identifier) => SEMVER_NUMERIC_IDENTIFIER.test(identifier))
  ) {
    return false;
  }
  const prerelease = prereleaseParts.join('-');
  if (
    prereleaseParts.length > 0 &&
    !prerelease
      .split('.')
      .every(
        (identifier) =>
          SEMVER_IDENTIFIER.test(identifier) &&
          (!/^[0-9]+$/u.test(identifier) || SEMVER_NUMERIC_IDENTIFIER.test(identifier))
      )
  ) {
    return false;
  }
  return (
    buildParts.length === 0 ||
    buildParts[0].split('.').every((identifier) => SEMVER_IDENTIFIER.test(identifier))
  );
}

export function formatBuildDate(date) {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) {
    throw new Error('Release archive date must be a valid Date.');
  }
  const year = String(date.getUTCFullYear());
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
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
      continue;
    }

    throw new Error(`Release archive contains unsupported filesystem entry: ${relativePath}`);
  }

  return files;
}

export async function readPackageMetadata(repoRoot) {
  const packageJsonPath = path.join(repoRoot, 'package.json');
  const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
  if (!packageJson || typeof packageJson !== 'object' || Array.isArray(packageJson)) {
    throw new Error('Release package.json must contain an object.');
  }
  if (typeof packageJson.name !== 'string') {
    throw new Error('Release package.json name must be a string.');
  }
  const name = normalizeArchiveSegment(packageJson.name);
  if (name.length === 0) {
    throw new Error('Release package.json name must produce a non-empty archive name.');
  }
  if (typeof packageJson.version !== 'string' || !isCanonicalSemVer(packageJson.version)) {
    throw new Error('Release package.json version must be an exact canonical SemVer string.');
  }
  return {
    name,
    version: packageJson.version,
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
  if (getForbiddenReleaseArtifactPathReason(file.relativePath)) {
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
  const releaseDir = path.resolve(repoRoot, 'build');
  const { name, version } = await readPackageMetadata(repoRoot);
  const archiveName = `${name}_${version}_${formatBuildDate(date)}.zip`;
  const archivePath = path.resolve(releaseDir, archiveName);
  if (path.dirname(archivePath) !== releaseDir) {
    throw new Error('Release archive path must be a direct child of build/.');
  }
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
      createFolders: false,
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
