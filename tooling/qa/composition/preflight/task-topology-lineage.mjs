import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function listHeadInventory(root, selectedRoot) {
  const output = execFileSync('git', ['ls-tree', '-r', 'HEAD', '--', selectedRoot], {
    cwd: root,
    encoding: 'utf8',
  });
  return new Map(
    output
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [metadata, relativePath] = line.split('\t');
        const [mode] = metadata.split(' ');
        return [relativePath, mode.slice(-3)];
      })
  );
}

function listLiveFiles(root, selectedRoot) {
  const files = [];
  const visit = (relativeDirectory) => {
    for (const entry of fs.readdirSync(path.join(root, relativeDirectory), {
      withFileTypes: true,
    })) {
      const relativePath = path.posix.join(relativeDirectory, entry.name);
      if (entry.isDirectory()) visit(relativePath);
      else if (entry.isFile()) files.push(relativePath);
    }
  };
  if (fs.existsSync(path.join(root, selectedRoot))) visit(selectedRoot);
  return files.sort();
}

function readHeadSources(root, relativePaths) {
  const result = spawnSync('git', ['cat-file', '--batch'], {
    cwd: root,
    input: `${relativePaths.map((file) => `HEAD:${file}`).join('\n')}\n`,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0 || !Buffer.isBuffer(result.stdout)) return null;
  const sources = new Map();
  let offset = 0;
  for (const relativePath of relativePaths) {
    const headerEnd = result.stdout.indexOf(10, offset);
    if (headerEnd < 0) return null;
    const header = result.stdout.subarray(offset, headerEnd).toString('utf8');
    const size = Number(header.split(' ')[2]);
    if (!Number.isSafeInteger(size)) return null;
    const contentStart = headerEnd + 1;
    sources.set(relativePath, result.stdout.subarray(contentStart, contentStart + size));
    offset = contentStart + size + 1;
  }
  return sources;
}

function hasExactMembers(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function hasMatchingExecutableMode(headMode, manifestMode) {
  const headExecutable = Number.parseInt(headMode, 8) & 0o111;
  const manifestExecutable = Number.parseInt(manifestMode, 8) & 0o111;
  return headExecutable === manifestExecutable;
}

function getSplitTargetPaths(entry) {
  if (!Array.isArray(entry?.splitTargets)) return [];
  return entry.splitTargets
    .map((target) => (typeof target === 'string' ? target : target?.targetPath))
    .filter((target) => typeof target === 'string');
}

function getCurrentMode(root, targetPath) {
  return (fs.statSync(path.join(root, targetPath)).mode & 0o777).toString(8);
}

function validateManifest(manifest, { head, root }) {
  if (manifest?.head !== head || typeof manifest?.selectedRoot !== 'string') return null;
  if (!Array.isArray(manifest.entries) || !Array.isArray(manifest.generatedEntries)) return null;
  const headInventory = listHeadInventory(root, manifest.selectedRoot);
  const sourcePaths = manifest.entries.map((entry) => entry?.sourcePath).sort();
  if (!sourcePaths.every((source) => typeof source === 'string')) return null;
  if (!hasExactMembers(sourcePaths, [...headInventory.keys()].sort())) return null;
  const declaredTargetPaths = [
    ...manifest.entries.map((entry) => entry.targetPath).filter(Boolean),
    ...manifest.entries.flatMap(getSplitTargetPaths),
    ...manifest.generatedEntries.map((entry) => entry?.targetPath),
  ];
  if (!declaredTargetPaths.every((target) => typeof target === 'string')) return null;
  const targetPaths = [...new Set(declaredTargetPaths)].sort();
  const lowercaseTargets = new Map();
  for (const target of targetPaths) {
    const lowercase = target.toLowerCase();
    if (lowercaseTargets.has(lowercase) && lowercaseTargets.get(lowercase) !== target) return null;
    lowercaseTargets.set(lowercase, target);
  }
  if (!targetPaths.every((target) => fs.existsSync(path.join(root, target)))) return null;
  const selectedTargets = targetPaths.filter(
    (target) => target === manifest.selectedRoot || target.startsWith(`${manifest.selectedRoot}/`)
  );
  if (!hasExactMembers(selectedTargets, listLiveFiles(root, manifest.selectedRoot))) return null;
  const sources = readHeadSources(root, sourcePaths);
  if (!sources) return null;
  for (const entry of manifest.entries) {
    const source = sources.get(entry.sourcePath);
    if (!source || !hasMatchingExecutableMode(headInventory.get(entry.sourcePath), entry.mode)) {
      return null;
    }
    if (entry.targetPath) {
      if (getCurrentMode(root, entry.targetPath) !== entry.mode) return null;
    }
    for (const splitTarget of getSplitTargetPaths(entry)) {
      if (getCurrentMode(root, splitTarget) !== entry.mode) return null;
    }
    if (createHash('sha256').update(source).digest('hex') !== entry.sha256) return null;
  }
  for (const entry of manifest.generatedEntries) {
    if (typeof entry?.targetPath !== 'string' || typeof entry?.mode !== 'string') return null;
    if (getCurrentMode(root, entry.targetPath) !== entry.mode) return null;
  }
  return manifest;
}

function parseManifest(manifestPath) {
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch {
    return null;
  }
}

export function collectTaskTopologySourceByTarget({ root = process.cwd() } = {}) {
  const tasksPath = path.join(root, 'tasks');
  if (!fs.existsSync(tasksPath)) return new Map();
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const result = new Map();
  const lowercaseTargets = new Map();
  const manifestFiles = fs.readdirSync(tasksPath).filter((file) => file.endsWith('-manifest.json'));
  for (const manifestFile of manifestFiles) {
    const manifest = validateManifest(parseManifest(path.join(tasksPath, manifestFile)), {
      head,
      root,
    });
    if (!manifest) continue;
    for (const entry of manifest.entries) {
      const targets = [entry.targetPath, ...getSplitTargetPaths(entry)].filter(Boolean);
      for (const target of targets) {
        const lowercase = target.toLowerCase();
        const existingTarget = lowercaseTargets.get(lowercase);
        if (
          (existingTarget && existingTarget !== target) ||
          (result.has(target) && result.get(target) !== entry.sourcePath)
        ) {
          return new Map();
        }
        lowercaseTargets.set(lowercase, target);
        result.set(target, entry.sourcePath);
      }
    }
  }
  return result;
}
