import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  collectPolicySurfaceInventory,
  POLICY_DISCOVERY_SOURCE_MANIFEST,
} from './technical-debt-policy-discovery.mjs';

const roots: string[] = [];

function write(root: string, relativePath: string, source: string) {
  const target = join(root, relativePath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, source);
}

function createRoot() {
  const root = mkdtempSync(join(tmpdir(), 'policy-source-manifest-'));
  roots.push(root);
  mkdirSync(join(root, 'tooling'), { recursive: true });
  for (const sourcePath of POLICY_DISCOVERY_SOURCE_MANIFEST.exactFiles) {
    write(root, sourcePath, 'export default {};\n');
  }
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('policy discovery source manifest', () => {
  it('rejects executable root config drift outside the exact source manifest', () => {
    const root = createRoot();
    write(root, 'commitlint.config.js', "export default { ignores: ['generated/**'] };\n");
    expect(() => collectPolicySurfaceInventory(root)).toThrow(
      'Active executable QA/config sources are absent from the policy discovery manifest: commitlint.config.js.'
    );
  });

  it('rejects a stale manifest entry whose exact config source disappeared', () => {
    const root = createRoot();
    rmSync(join(root, 'playwright.config.ts'));
    expect(() => collectPolicySurfaceInventory(root)).toThrow(
      'Policy discovery exact source is missing: playwright.config.ts.'
    );
  });
});

describe('policy discovery source modes', () => {
  it('rejects an unlisted executable config symlink', () => {
    const root = createRoot();
    write(root, 'config-target.js', "export default { ignores: ['generated/**'] };\n");
    symlinkSync('config-target.js', join(root, 'commitlint.config.js'));
    expect(() => collectPolicySurfaceInventory(root)).toThrow(
      'Active executable QA/config sources are absent from the policy discovery manifest: commitlint.config.js.'
    );
  });

  it('rejects a declared exact config symlink', () => {
    const root = createRoot();
    const exactPath = join(root, 'playwright.config.ts');
    rmSync(exactPath);
    write(root, 'config-target.ts', 'export default {};\n');
    symlinkSync('config-target.ts', exactPath);
    expect(() => collectPolicySurfaceInventory(root)).toThrow(
      'Policy discovery exact source must be a regular file: playwright.config.ts.'
    );
  });
});
