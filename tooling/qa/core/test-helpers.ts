import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { afterEach, vi } from 'vitest';

const tempDirs: string[] = [];

export function createTempRoot(prefix: string) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(root);
  return root;
}

export function writeFile(root: string, relativePath: string, contents: string) {
  const absolutePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, contents);
  return absolutePath;
}

export function writeJson(root: string, relativePath: string, value: unknown) {
  return writeFile(root, relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

export function runGit(root: string, ...args: string[]) {
  try {
    execFileSync(process.platform === 'win32' ? 'git.exe' : 'git', args, {
      cwd: root,
      stdio: 'pipe',
    });
  } catch (error) {
    // why: some WSL/Node combinations report EPERM even though git completed with status 0.
    if (
      error instanceof Error &&
      'code' in error &&
      'status' in error &&
      error.code === 'EPERM' &&
      error.status === 0
    ) {
      return;
    }

    throw error;
  }
}

export function initGitRepo(root: string) {
  runGit(root, 'init');
  runGit(root, 'config', 'user.email', 'codex@example.com');
  runGit(root, 'config', 'user.name', 'Codex');
}

export async function importFresh<T>(specifier: string, importerUrl = import.meta.url): Promise<T> {
  vi.resetModules();
  const resolvedUrl = new URL(specifier, importerUrl);
  resolvedUrl.searchParams.set('t', String(Date.now()));
  return import(resolvedUrl.href) as Promise<T>;
}

export async function withCwd<T>(cwd: string, run: () => Promise<T> | T) {
  const previous = process.cwd();
  process.chdir(cwd);
  try {
    return await run();
  } finally {
    process.chdir(previous);
  }
}

afterEach(() => {
  vi.resetModules();
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});
