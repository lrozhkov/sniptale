import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import { prepareTrustedControlDependencyMount } from './trusted-control-dependencies.mjs';

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

it('mounts candidate dependencies below the read-only trusted control root', () => {
  const executionRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sniptale-trusted-deps-'));
  const controlRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sniptale-trusted-root-'));
  temporaryRoots.push(executionRoot, controlRoot);

  expect(
    prepareTrustedControlDependencyMount({
      controlRoot,
      executionRoot,
      trustedCiRoot: controlRoot,
    })
  ).toEqual([
    '--volume',
    `${path.join(executionRoot, 'node_modules')}:/opt/sniptale-trusted/node_modules:ro`,
  ]);
  expect(fs.statSync(path.join(executionRoot, 'node_modules')).isDirectory()).toBe(true);
  expect(fs.statSync(path.join(controlRoot, 'node_modules')).isDirectory()).toBe(true);
});

it('does not prepare a dependency mount without a separate trusted control root', () => {
  const executionRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sniptale-local-deps-'));
  temporaryRoots.push(executionRoot);

  expect(
    prepareTrustedControlDependencyMount({
      controlRoot: executionRoot,
      executionRoot,
      trustedCiRoot: undefined,
    })
  ).toEqual([]);
  expect(fs.existsSync(path.join(executionRoot, 'node_modules'))).toBe(false);
});
