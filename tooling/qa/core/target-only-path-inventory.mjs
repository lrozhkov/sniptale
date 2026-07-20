import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { readTargetOnlyPathPolicy } from './target-only-path-policy.mjs';
import {
  TARGET_ONLY_TEXT_FILE,
  targetOnlyReferenceRecords,
} from './target-only-path-references.mjs';

function gitExecutable() {
  return process.platform === 'win32' ? 'git.exe' : 'git';
}

export function currentRepositoryPaths(root = process.cwd()) {
  try {
    const output = execFileSync(
      gitExecutable(),
      ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
      {
        cwd: root,
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'ignore'],
      }
    );
    return output
      .split('\0')
      .filter((path) => path && existsSync(resolve(root, path)))
      .sort();
  } catch {
    const paths = [];
    const stack = [root];
    while (stack.length > 0) {
      const current = stack.pop();
      for (const entry of readdirSync(current, { withFileTypes: true })) {
        if (['.git', 'node_modules'].includes(entry.name)) continue;
        const absolute = resolve(current, entry.name);
        if (entry.isDirectory()) stack.push(absolute);
        else paths.push(absolute.slice(root.length + 1).replaceAll('\\', '/'));
      }
    }
    return paths.sort();
  }
}

export function currentLegacyReferenceRecords(root = process.cwd()) {
  const policy = readTargetOnlyPathPolicy(root);
  return currentRepositoryPaths(root).flatMap((path) => {
    if (!TARGET_ONLY_TEXT_FILE.test(path)) {
      return [];
    }
    try {
      return targetOnlyReferenceRecords(path, readFileSync(resolve(root, path), 'utf8'), policy);
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        (error.code === 'ENOENT' || error.code === 'EISDIR')
      ) {
        return [];
      }
      throw error;
    }
  });
}
