import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  rmdirSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import JSZip from 'jszip';

export const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
export const sourceRoot = path.join(repoRoot, 'docs/agent-tooling');
export const archivePath = path.join(repoRoot, 'artifacts/agent-tooling.zip');

const PAYLOAD_ROOTS = ['AGENTS.md', '.agents'];
const ZIP_TIMESTAMP = new Date('1980-01-01T00:00:00.000Z');

function toPosixPath(value) {
  return value.split(path.sep).join('/');
}

function collectFiles(directory, relativeDirectory = '') {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = path.join(relativeDirectory, entry.name);
    const absolutePath = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`Agent kit source must not contain symlinks: ${toPosixPath(relativePath)}`);
    }
    if (entry.isDirectory()) return collectFiles(absolutePath, relativePath);
    if (!entry.isFile()) {
      throw new Error(
        `Agent kit source contains an unsupported entry: ${toPosixPath(relativePath)}`
      );
    }
    return [toPosixPath(relativePath)];
  });
}

export function collectAgentToolingFiles(sourceDirectory = sourceRoot) {
  const files = [];
  for (const payloadRoot of PAYLOAD_ROOTS) {
    const absolutePath = path.join(sourceDirectory, payloadRoot);
    if (!existsSync(absolutePath)) throw new Error(`Agent kit source is missing ${payloadRoot}`);
    const stats = lstatSync(absolutePath);
    if (stats.isSymbolicLink())
      throw new Error(`Agent kit source must not be a symlink: ${payloadRoot}`);
    if (stats.isDirectory()) {
      files.push(...collectFiles(absolutePath).map((file) => `${payloadRoot}/${file}`));
    } else if (stats.isFile()) {
      files.push(payloadRoot);
    } else {
      throw new Error(`Agent kit source contains an unsupported entry: ${payloadRoot}`);
    }
  }
  return files.sort();
}

function assertSafeDestination(destinationRoot, relativePath) {
  const segments = relativePath.split('/');
  let currentPath = destinationRoot;
  for (const segment of segments) {
    currentPath = path.join(currentPath, segment);
    if (existsSync(currentPath) && lstatSync(currentPath).isSymbolicLink()) {
      throw new Error(`Refusing to follow a local symlink: ${relativePath}`);
    }
  }
}

function filesMatch(left, right) {
  return readFileSync(left).equals(readFileSync(right));
}

export function installAgentTooling({
  destinationRoot = repoRoot,
  force = false,
  sourceDirectory = sourceRoot,
} = {}) {
  const files = collectAgentToolingFiles(sourceDirectory);
  const conflicts = [];
  for (const relativePath of files) {
    const source = path.join(sourceDirectory, relativePath);
    const destination = path.join(destinationRoot, relativePath);
    assertSafeDestination(destinationRoot, relativePath);
    if (existsSync(destination) && !lstatSync(destination).isFile()) {
      throw new Error(`Refusing to replace a non-file local path: ${relativePath}`);
    }
    if (existsSync(destination) && !filesMatch(source, destination)) conflicts.push(relativePath);
  }
  if (conflicts.length > 0 && !force) {
    throw new Error(
      `Local agent tooling differs from the tracked kit: ${conflicts.join(', ')}. ` +
        'Rerun with --force to replace it.'
    );
  }
  for (const relativePath of files) {
    const source = path.join(sourceDirectory, relativePath);
    const destination = path.join(destinationRoot, relativePath);
    mkdirSync(path.dirname(destination), { recursive: true });
    copyFileSync(source, destination);
  }
  return files;
}

function pruneEmptyDirectories(destinationRoot, files) {
  const directories = new Set(
    files.flatMap((file) => {
      const entries = [];
      let directory = path.posix.dirname(file);
      while (directory !== '.') {
        entries.push(directory);
        directory = path.posix.dirname(directory);
      }
      return entries;
    })
  );
  for (const directory of [...directories].sort((left, right) => right.length - left.length)) {
    const absolutePath = path.join(destinationRoot, directory);
    if (existsSync(absolutePath) && lstatSync(absolutePath).isDirectory()) {
      try {
        rmdirSync(absolutePath);
      } catch (error) {
        if (error?.code !== 'ENOTEMPTY') throw error;
      }
    }
  }
}

export function removeAgentTooling({
  destinationRoot = repoRoot,
  force = false,
  sourceDirectory = sourceRoot,
} = {}) {
  const files = collectAgentToolingFiles(sourceDirectory);
  const modified = [];
  for (const relativePath of files) {
    const source = path.join(sourceDirectory, relativePath);
    const destination = path.join(destinationRoot, relativePath);
    assertSafeDestination(destinationRoot, relativePath);
    if (!existsSync(destination)) continue;
    if (!lstatSync(destination).isFile()) {
      throw new Error(`Refusing to remove a non-file local path: ${relativePath}`);
    }
    if (!filesMatch(source, destination)) modified.push(relativePath);
  }
  if (modified.length > 0 && !force) {
    throw new Error(
      `Local agent tooling has modified files: ${modified.join(', ')}. ` +
        'Rerun with --force to remove only the kit-owned paths.'
    );
  }
  for (const relativePath of files) {
    const destination = path.join(destinationRoot, relativePath);
    if (existsSync(destination)) rmSync(destination, { force: true });
  }
  pruneEmptyDirectories(destinationRoot, files);
  return files;
}

export async function packAgentTooling({
  destination = archivePath,
  sourceDirectory = sourceRoot,
} = {}) {
  const zip = new JSZip();
  const files = collectAgentToolingFiles(sourceDirectory);
  for (const relativePath of files) {
    zip.file(relativePath, readFileSync(path.join(sourceDirectory, relativePath)), {
      createFolders: false,
      date: ZIP_TIMESTAMP,
      unixPermissions: 0o100644,
    });
  }
  const contents = await zip.generateAsync({
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
    platform: 'UNIX',
    type: 'nodebuffer',
  });
  mkdirSync(path.dirname(destination), { recursive: true });
  const temporaryPath = `${destination}.tmp`;
  writeFileSync(temporaryPath, contents);
  renameSync(temporaryPath, destination);
  return { destination, files };
}
