import { afterEach, expect, it } from 'vitest';

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { targetOnlyPathErrors } from './verify-target-only-paths.mjs';

const roots: string[] = [];
const retiredPath = 'apps/extension/src/video-editor/library/effects-dock/apply.ts';

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true });
});

function write(root: string, path: string, content: string) {
  const output = join(root, path);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, content);
}

it('rejects restoration from the complete exact EffectV1 retired inventory', () => {
  const root = mkdtempSync(join(tmpdir(), 'target-only-effect-v1-'));
  roots.push(root);
  write(
    root,
    'tooling/configs/qa/target-only-paths.data.json',
    JSON.stringify({
      schemaVersion: 2,
      physicalRetiredRoots: [],
      retiredRootFiles: [],
      retiredControlPrefixes: [],
      retiredControls: [],
      effectV1RetiredPaths: [retiredPath],
      effectV1RetiredPathsSha256:
        '37e121688ea9c11b3046e1fe16313943f18ff4ca30966b1392f7e92e606e7886',
      requiredTargets: [],
    })
  );
  write(root, '.prettierignore', '*.md\n');
  write(root, 'README.md', '# Repository\n');
  write(root, 'docs/README.md', '# Docs\n');
  write(
    root,
    'tooling/configs/qa/docs-topology.data.json',
    JSON.stringify({
      schemaVersion: 2,
      activeIndex: 'docs/README.md',
      activeDocuments: [],
      generatedDocuments: [],
      rootDocuments: ['README.md'],
      skillDocuments: [],
      productDocuments: [],
      requiredIndexContractFragments: [],
      retiredActivePrefixes: [],
      retiredActivePaths: [],
      forbiddenActiveFragments: [],
    })
  );
  write(root, retiredPath, 'export {};\n');

  expect(targetOnlyPathErrors(root)).toContain(
    `retired EffectV1 migration path remains: ${retiredPath}`
  );
});
