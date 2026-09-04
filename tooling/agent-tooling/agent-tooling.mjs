import { inflateRawSync } from 'node:zlib';
import {
  chmodSync,
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
export const sourceArchive = path.join(repoRoot, 'docs/agent-tooling/agent-tooling.zip');
export const AGENT_TOOLING_PAYLOAD_PATHS = Object.freeze([
  '.agents/README.md',
  '.agents/skills/architecture-code-review/SKILL.md',
  '.agents/skills/architecture-code-review/agents/openai.yaml',
  '.agents/skills/architecture-code-review/references/architecture-review-checklist.md',
  '.agents/skills/repo-audit/SKILL.md',
  '.agents/skills/repo-audit/agents/openai.yaml',
  '.agents/skills/repo-audit/references/repo-audit-checklist.md',
  '.agents/skills/security-code-review/SKILL.md',
  '.agents/skills/security-code-review/agents/openai.yaml',
  '.agents/skills/security-code-review/references/security-review-checklist.md',
  '.agents/skills/topology-plan-review/SKILL.md',
  '.agents/skills/topology-plan-review/agents/openai.yaml',
  '.agents/skills/topology-plan-review/references/topology-plan-review-checklist.md',
  'AGENTS.md',
  'DESIGN.md',
]);

const LEGACY_PATHS = [...AGENT_TOOLING_PAYLOAD_PATHS, 'README.md'];
const FIXED_ZIP_DATE = new Date('1980-01-01T00:00:00.000Z');
const MAX_ENTRY_BYTES = 1024 * 1024;
const MAX_TOTAL_BYTES = 5 * 1024 * 1024;
const MAX_ARCHIVE_BYTES = 10 * 1024 * 1024;

export function parseAgentToolingCliOptions(argv) {
  const args = new Set(argv);
  const unsupported = [...args].filter((argument) => argument !== '--force');
  if (unsupported.length > 0) throw new Error(`Unsupported argument: ${unsupported[0]}`);
  return { force: args.has('--force') };
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function findEndOfCentralDirectory(buffer) {
  const minimum = Math.max(0, buffer.length - 65_557);
  for (let offset = buffer.length - 22; offset >= minimum; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  throw new Error('Agent tooling archive has no ZIP central directory');
}

function assertSafeArchiveName(name) {
  if (
    !name ||
    name.includes('\\') ||
    name.startsWith('/') ||
    name.includes('\0') ||
    path.posix.normalize(name) !== name ||
    name.split('/').includes('..')
  ) {
    throw new Error(`Agent tooling archive has an unsafe path: ${name}`);
  }
}

function parseCentralDirectory(buffer) {
  const eocd = findEndOfCentralDirectory(buffer);
  const disk = buffer.readUInt16LE(eocd + 4);
  const centralDisk = buffer.readUInt16LE(eocd + 6);
  const entriesOnDisk = buffer.readUInt16LE(eocd + 8);
  const entryCount = buffer.readUInt16LE(eocd + 10);
  const centralSize = buffer.readUInt32LE(eocd + 12);
  const centralOffset = buffer.readUInt32LE(eocd + 16);
  if (disk !== 0 || centralDisk !== 0 || entriesOnDisk !== entryCount || entryCount > 256) {
    throw new Error('Agent tooling archive has unsupported ZIP ownership');
  }
  if (centralOffset + centralSize !== eocd) {
    throw new Error('Agent tooling archive central directory bounds are invalid');
  }
  const entries = [];
  let cursor = centralOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > eocd) {
      throw new Error('Agent tooling archive central directory is truncated');
    }
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) {
      throw new Error('Agent tooling archive central entry is malformed');
    }
    const flags = buffer.readUInt16LE(cursor + 8);
    const method = buffer.readUInt16LE(cursor + 10);
    const checksum = buffer.readUInt32LE(cursor + 16);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const size = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const mode = buffer.readUInt32LE(cursor + 38) >>> 16;
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const nextCursor = cursor + 46 + nameLength + extraLength + commentLength;
    if (nextCursor > eocd) {
      throw new Error('Agent tooling archive central directory is truncated');
    }
    const nameBuffer = buffer.subarray(cursor + 46, cursor + 46 + nameLength);
    const name = nameBuffer.toString('utf8');
    if (name.includes('\ufffd') || (flags & 1) !== 0 || ![0, 8].includes(method)) {
      throw new Error(`Agent tooling archive entry is unsupported: ${name}`);
    }
    assertSafeArchiveName(name);
    const fileType = mode & 0o170000;
    if (name.endsWith('/') || (fileType !== 0 && fileType !== 0o100000)) {
      throw new Error(`Agent tooling archive entry is not a regular file: ${name}`);
    }
    if (size > MAX_ENTRY_BYTES)
      throw new Error(`Agent tooling archive entry is too large: ${name}`);
    entries.push({
      checksum,
      compressedSize,
      flags,
      localOffset,
      method,
      mode: mode & 0o777,
      name,
      size,
    });
    cursor = nextCursor;
  }
  if (cursor !== eocd) throw new Error('Agent tooling archive central directory is truncated');
  return entries;
}

function assertExactInventory(entries) {
  const names = entries.map(({ name }) => name);
  const unique = new Set(names);
  const caseFolded = new Set(names.map((name) => name.toLowerCase()));
  if (unique.size !== names.length || caseFolded.size !== names.length) {
    throw new Error('Agent tooling archive has duplicate or case-colliding paths');
  }
  for (const name of names) {
    for (const candidate of names) {
      if (candidate !== name && candidate.startsWith(`${name}/`)) {
        throw new Error('Agent tooling archive has a file/ancestor collision');
      }
    }
  }
  if (JSON.stringify([...names].sort()) !== JSON.stringify(AGENT_TOOLING_PAYLOAD_PATHS)) {
    throw new Error('Agent tooling archive does not contain the exact payload');
  }
}

function extractEntry(buffer, entry) {
  const offset = entry.localOffset;
  if (offset + 30 > buffer.length) {
    throw new Error(`Agent tooling archive local entry is truncated: ${entry.name}`);
  }
  if (buffer.readUInt32LE(offset) !== 0x04034b50) {
    throw new Error(`Agent tooling archive local entry is malformed: ${entry.name}`);
  }
  const nameLength = buffer.readUInt16LE(offset + 26);
  const extraLength = buffer.readUInt16LE(offset + 28);
  const localName = buffer.subarray(offset + 30, offset + 30 + nameLength).toString('utf8');
  if (localName !== entry.name) {
    throw new Error(`Agent tooling archive local name mismatch: ${entry.name}`);
  }
  const start = offset + 30 + nameLength + extraLength;
  const end = start + entry.compressedSize;
  if (end > buffer.length)
    throw new Error(`Agent tooling archive entry is truncated: ${entry.name}`);
  const compressed = buffer.subarray(start, end);
  let contents;
  try {
    contents =
      entry.method === 0
        ? Buffer.from(compressed)
        : inflateRawSync(compressed, { maxOutputLength: entry.size + 1 });
  } catch (error) {
    throw new Error(`Agent tooling archive entry exceeds its declared size: ${entry.name}`, {
      cause: error,
    });
  }
  if (contents.length !== entry.size || crc32(contents) !== entry.checksum) {
    throw new Error(`Agent tooling archive CRC or size mismatch: ${entry.name}`);
  }
  return contents;
}

export function loadAgentToolingArchive(archivePath = sourceArchive) {
  const archiveStats = lstatSync(archivePath);
  if (!archiveStats.isFile() || archiveStats.isSymbolicLink()) {
    throw new Error('Agent tooling archive must be a regular non-symlink file');
  }
  if (archiveStats.size > MAX_ARCHIVE_BYTES) {
    throw new Error('Agent tooling archive file is too large');
  }
  const buffer = readFileSync(archivePath);
  const entries = parseCentralDirectory(buffer);
  assertExactInventory(entries);
  if (entries.reduce((total, entry) => total + entry.size, 0) > MAX_TOTAL_BYTES) {
    throw new Error('Agent tooling archive payload is too large');
  }
  const byName = new Map(entries.map((entry) => [entry.name, entry]));
  return new Map(
    AGENT_TOOLING_PAYLOAD_PATHS.map((name) => {
      const entry = byName.get(name);
      return [name, { contents: extractEntry(buffer, entry), mode: entry.mode || 0o644 }];
    })
  );
}

function assertSafeDestination(destinationRoot, relativePath) {
  let currentPath = destinationRoot;
  for (const segment of relativePath.split('/')) {
    currentPath = path.join(currentPath, segment);
    if (existsSync(currentPath) && lstatSync(currentPath).isSymbolicLink()) {
      throw new Error(`Refusing to follow a local symlink: ${relativePath}`);
    }
  }
}

function filesMatch(destination, expected) {
  return readFileSync(destination).equals(expected);
}

export function installAgentTooling({
  destinationRoot = repoRoot,
  force = false,
  archivePath = sourceArchive,
} = {}) {
  const files = loadAgentToolingArchive(archivePath);
  const conflicts = [];
  for (const [relativePath, entry] of files) {
    const destination = path.join(destinationRoot, relativePath);
    assertSafeDestination(destinationRoot, relativePath);
    if (existsSync(destination) && !lstatSync(destination).isFile()) {
      throw new Error(`Refusing to replace a non-file local path: ${relativePath}`);
    }
    if (existsSync(destination) && !filesMatch(destination, entry.contents))
      conflicts.push(relativePath);
  }
  if (conflicts.length > 0 && !force) {
    throw new Error(
      `Local agent tooling differs from the tracked kit: ${conflicts.join(', ')}. Rerun with --force to replace it.`
    );
  }
  for (const [relativePath, entry] of files) {
    const destination = path.join(destinationRoot, relativePath);
    mkdirSync(path.dirname(destination), { recursive: true });
    writeFileSync(destination, entry.contents, { mode: entry.mode });
    chmodSync(destination, entry.mode);
  }
  return [...files.keys()];
}

function pruneEmptyDirectories(destinationRoot, files, { bestEffort = false } = {}) {
  const directories = new Set(
    files.flatMap((file) => {
      const result = [];
      let directory = path.posix.dirname(file);
      while (directory !== '.') {
        result.push(directory);
        directory = path.posix.dirname(directory);
      }
      return result;
    })
  );
  for (const directory of [...directories].sort((left, right) => right.length - left.length)) {
    const absolutePath = path.join(destinationRoot, directory);
    if (!existsSync(absolutePath) || !lstatSync(absolutePath).isDirectory()) continue;
    try {
      rmdirSync(absolutePath);
    } catch (error) {
      if (!bestEffort && error?.code !== 'ENOTEMPTY') throw error;
    }
  }
}

export function removeAgentTooling({
  destinationRoot = repoRoot,
  force = false,
  archivePath = sourceArchive,
} = {}) {
  const files = loadAgentToolingArchive(archivePath);
  const modified = [];
  for (const [relativePath, entry] of files) {
    const destination = path.join(destinationRoot, relativePath);
    assertSafeDestination(destinationRoot, relativePath);
    if (!existsSync(destination)) continue;
    if (!lstatSync(destination).isFile())
      throw new Error(`Refusing to remove a non-file local path: ${relativePath}`);
    if (!filesMatch(destination, entry.contents)) modified.push(relativePath);
  }
  if (modified.length > 0 && !force) {
    throw new Error(
      `Local agent tooling has modified files: ${modified.join(', ')}. ` +
        'Rerun with --force to remove only the kit-owned paths.'
    );
  }
  for (const relativePath of files.keys())
    rmSync(path.join(destinationRoot, relativePath), { force: true });
  pruneEmptyDirectories(destinationRoot, [...files.keys()]);
  return [...files.keys()];
}

function collectTargetEntries(directory, relative = '') {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const next = path.posix.join(relative, entry.name);
    const absolute = path.join(directory, entry.name);
    if (entry.isSymbolicLink())
      throw new Error(`Agent tooling archive directory has an unexpected entry: ${next}`);
    return entry.isDirectory()
      ? [{ path: next, type: 'directory' }, ...collectTargetEntries(absolute, next)]
      : [{ path: next, type: 'file' }];
  });
}

function assertMigrationTarget(archivePath) {
  const directory = path.dirname(archivePath);
  const allowed = new Set([...LEGACY_PATHS, path.basename(archivePath)]);
  const allowedDirectories = new Set(
    [...allowed].flatMap((entry) => {
      const directories = [];
      let current = path.posix.dirname(entry);
      while (current !== '.') {
        directories.push(current);
        current = path.posix.dirname(current);
      }
      return directories;
    })
  );
  for (const entry of collectTargetEntries(directory)) {
    const expected = entry.type === 'directory' ? allowedDirectories : allowed;
    if (!expected.has(entry.path))
      throw new Error(`Agent tooling archive directory has an unexpected entry: ${entry.path}`);
  }
}

function assertSafeOwnedDirectory(repositoryRoot, directory, label) {
  const relative = path.relative(repositoryRoot, directory);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`${label} must stay inside the repository root`);
  }
  let current = repositoryRoot;
  for (const segment of relative.split(path.sep)) {
    current = path.join(current, segment);
    if (!existsSync(current)) continue;
    const stats = lstatSync(current);
    if (!stats.isDirectory() || stats.isSymbolicLink()) {
      throw new Error(`${label} has an unsafe directory component: ${current}`);
    }
  }
}

function restoreSnapshots(directory, snapshots) {
  for (const [relativePath, snapshot] of snapshots) {
    const target = path.join(directory, relativePath);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, snapshot.contents, { mode: snapshot.mode });
    chmodSync(target, snapshot.mode);
  }
}

function readAgentToolingSources(repositoryRoot) {
  const sources = new Map();
  for (const relativePath of AGENT_TOOLING_PAYLOAD_PATHS) {
    const source = path.join(repositoryRoot, relativePath);
    if (!existsSync(source) || !lstatSync(source).isFile() || lstatSync(source).isSymbolicLink()) {
      throw new Error(`Agent tooling source is missing or unsafe: ${relativePath}`);
    }
    sources.set(relativePath, {
      contents: readFileSync(source),
      mode: lstatSync(source).mode & 0o777,
    });
  }
  validateAgentToolingMarkdownLinks(sources);
  return sources;
}

function validateAgentToolingMarkdownLinks(sources) {
  const markdownLinkPattern = /\[[^\]]*\]\(([^)]+)\)/gu;
  for (const [relativePath, entry] of sources) {
    if (!relativePath.endsWith('.md')) continue;
    const text = entry.contents.toString('utf8');
    for (const match of text.matchAll(markdownLinkPattern)) {
      const target = match[1].trim().replace(/^<|>$/gu, '').split('#')[0];
      if (!target || /^(?:[a-z]+:|\/)/iu.test(target)) continue;
      const resolved = path.posix.normalize(
        path.posix.join(path.posix.dirname(relativePath), target)
      );
      if (!sources.has(resolved)) {
        throw new Error(`Agent tooling Markdown link is unresolved: ${relativePath} -> ${target}`);
      }
    }
  }
}

async function createAgentToolingZip(sources) {
  const zip = new JSZip();
  for (const [relativePath, entry] of sources) {
    zip.file(relativePath, entry.contents, {
      date: FIXED_ZIP_DATE,
      createFolders: false,
      unixPermissions: 0o100000 | entry.mode,
    });
  }
  return zip.generateAsync({
    type: 'nodebuffer',
    platform: 'UNIX',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  });
}

function preparePackStaging(repositoryRoot) {
  const stagingDirectory = path.join(repositoryRoot, '.tmp/agent-tooling-pack');
  assertSafeOwnedDirectory(repositoryRoot, stagingDirectory, 'Agent tooling staging');
  mkdirSync(stagingDirectory, { recursive: true });
  assertSafeOwnedDirectory(repositoryRoot, stagingDirectory, 'Agent tooling staging');
  const nextPath = path.join(stagingDirectory, 'next.zip');
  const previousPath = path.join(stagingDirectory, 'previous.zip');
  for (const entry of readdirSync(stagingDirectory, { withFileTypes: true })) {
    if (!['next.zip', 'previous.zip'].includes(entry.name) || !entry.isFile())
      throw new Error(`Agent tooling staging has an unexpected entry: ${entry.name}`);
  }
  return { nextPath, previousPath };
}

function reconcileInterruptedPack(archivePath, nextPath, previousPath) {
  if (existsSync(previousPath)) {
    loadAgentToolingArchive(previousPath);
    if (!existsSync(archivePath)) renameSync(previousPath, archivePath);
    else rmSync(previousPath);
  }
  rmSync(nextPath, { force: true });
}

function snapshotLegacyFiles(archiveDirectory) {
  const snapshots = new Map();
  for (const relativePath of LEGACY_PATHS) {
    const target = path.join(archiveDirectory, relativePath);
    if (existsSync(target))
      snapshots.set(relativePath, {
        contents: readFileSync(target),
        mode: lstatSync(target).mode & 0o777,
      });
  }
  return snapshots;
}

function commitPackedArchive({
  archiveDirectory,
  archivePath,
  nextPath,
  previousPath,
  snapshots,
  beforePublish,
}) {
  try {
    for (const relativePath of snapshots.keys())
      rmSync(path.join(archiveDirectory, relativePath), { force: true });
    if (existsSync(archivePath)) renameSync(archivePath, previousPath);
    beforePublish?.();
    renameSync(nextPath, archivePath);
  } catch (error) {
    restoreSnapshots(archiveDirectory, snapshots);
    if (!existsSync(archivePath) && existsSync(previousPath)) renameSync(previousPath, archivePath);
    rmSync(nextPath, { force: true });
    throw error;
  }
}

export async function packAgentTooling({
  repositoryRoot = repoRoot,
  archivePath = sourceArchive,
  testHooks = {},
} = {}) {
  const sources = readAgentToolingSources(repositoryRoot);
  const buffer = await createAgentToolingZip(sources);
  const archiveDirectory = path.dirname(archivePath);
  assertSafeOwnedDirectory(repositoryRoot, archiveDirectory, 'Agent tooling archive');
  mkdirSync(archiveDirectory, { recursive: true });
  assertSafeOwnedDirectory(repositoryRoot, archiveDirectory, 'Agent tooling archive');
  assertMigrationTarget(archivePath);
  const { nextPath, previousPath } = preparePackStaging(repositoryRoot);
  reconcileInterruptedPack(archivePath, nextPath, previousPath);
  writeFileSync(nextPath, buffer, { flag: 'wx', mode: 0o600 });
  loadAgentToolingArchive(nextPath);
  const snapshots = snapshotLegacyFiles(archiveDirectory);
  commitPackedArchive({
    archiveDirectory,
    archivePath,
    nextPath,
    previousPath,
    snapshots,
    beforePublish: testHooks.beforePublish,
  });
  rmSync(previousPath, { force: true });
  pruneEmptyDirectories(archiveDirectory, LEGACY_PATHS, { bestEffort: true });
  return { archivePath, files: AGENT_TOOLING_PAYLOAD_PATHS };
}
