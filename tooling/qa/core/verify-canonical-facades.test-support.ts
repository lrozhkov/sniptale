import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach } from 'vitest';

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

function withTempRepo(files: Record<string, string>, run: (cwd: string) => void): void {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-canonical-facades-'));
  tempDirs.push(root);

  for (const [relativePath, contents] of Object.entries(files)) {
    const absolutePath = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, contents);
  }

  const previousCwd = process.cwd();
  process.chdir(root);

  try {
    run(root);
  } finally {
    process.chdir(previousCwd);
  }
}

export async function withCanonicalFacadeModule<T>(
  files: Record<string, string>,
  run: (module: typeof import('./verify-canonical-facades.mjs'), root: string) => T
): Promise<void> {
  const module = await import('./verify-canonical-facades.mjs');
  withTempRepo(files, (root) => {
    run(module, root);
  });
}
