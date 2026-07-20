import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const GIT_BUFFER_BYTES = 64 * 1024 * 1024;

function git(rootDir, args, { encoding = 'utf8' } = {}) {
  const result = spawnSync(process.platform === 'win32' ? 'git.exe' : 'git', args, {
    cwd: rootDir,
    encoding,
    maxBuffer: GIT_BUFFER_BYTES,
  });
  if (result.error || result.status !== 0) return null;
  return result.stdout;
}

function sha256(parts) {
  const hash = createHash('sha256');
  for (const part of parts) hash.update(part);
  return hash.digest('hex');
}

function collectUntrackedFiles(rootDir) {
  const output = git(rootDir, ['ls-files', '--others', '--exclude-standard', '-z'], {
    encoding: 'buffer',
  });
  if (!Buffer.isBuffer(output)) return [];
  return output.toString('utf8').split('\0').filter(Boolean).sort();
}

function collectChangedFileCount(rootDir) {
  const output = git(rootDir, ['status', '--porcelain=v1', '-z', '--untracked-files=all'], {
    encoding: 'buffer',
  });
  if (!Buffer.isBuffer(output)) return 0;
  return output.toString('utf8').split('\0').filter(Boolean).length;
}

function createDiffFingerprint(rootDir, untrackedFiles) {
  const trackedDiff = git(rootDir, ['diff', '--binary', 'HEAD', '--'], { encoding: 'buffer' });
  if (!Buffer.isBuffer(trackedDiff)) return null;
  const parts = [trackedDiff];
  for (const relativeFile of untrackedFiles) {
    const filePath = path.join(rootDir, relativeFile);
    parts.push(Buffer.from(`\0${relativeFile}\0`, 'utf8'));
    try {
      parts.push(fs.readFileSync(filePath));
    } catch {
      parts.push(Buffer.from('<unreadable>', 'utf8'));
    }
  }
  return sha256(parts);
}

export function collectRepositoryContext({
  rootDir = process.cwd(),
  scope = 'workspace',
  suite = null,
  targetFiles = [],
} = {}) {
  const headOutput = git(rootDir, ['rev-parse', 'HEAD']);
  const treeOutput = git(rootDir, ['rev-parse', 'HEAD^{tree}']);
  if (typeof headOutput !== 'string' || typeof treeOutput !== 'string') {
    return {
      head: null,
      treeFingerprint: null,
      diffFingerprint: null,
      changedFileCount: 0,
      scope,
      suite,
      targetFiles: [...new Set(targetFiles)].sort(),
    };
  }
  const untrackedFiles = collectUntrackedFiles(rootDir);
  return {
    head: headOutput.trim(),
    treeFingerprint: treeOutput.trim(),
    diffFingerprint: createDiffFingerprint(rootDir, untrackedFiles),
    changedFileCount: collectChangedFileCount(rootDir),
    scope,
    suite,
    targetFiles: [...new Set(targetFiles)].sort(),
  };
}
