import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { collectHeavyRuntimeImportOwnershipViolations } from './verify-heavy-runtime-import-ownership.mjs';

const tempDirs: string[] = [];

function writeFile(root: string, relativePath: string, contents: string) {
  const absolutePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, contents);
  return absolutePath;
}

function createTempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-heavy-runtime-import-ownership-'));
  tempDirs.push(root);
  return root;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

function verifiesAllowedFabricImport() {
  const root = createTempRoot();
  const file = writeFile(
    root,
    'apps/extension/src/editor/controller/canvas.ts',
    "import { Canvas } from 'fabric';\nexport { Canvas };\n"
  );

  expect(collectHeavyRuntimeImportOwnershipViolations([file], { rootDir: root })).toEqual([]);
}

function verifiesForbiddenFabricImport() {
  const root = createTempRoot();
  const file = writeFile(
    root,
    'src/shared/canvas.ts',
    "import { Canvas } from 'fabric';\nexport { Canvas };\n"
  );

  expect(collectHeavyRuntimeImportOwnershipViolations([file], { rootDir: root })).toEqual([
    expect.objectContaining({
      rule: 'heavy-import-fabric-owner',
      file: 'src/shared/canvas.ts',
    }),
  ]);
}

function verifiesForbiddenJszipImport() {
  const root = createTempRoot();
  const file = writeFile(
    root,
    'apps/extension/src/content/logic/archive.ts',
    "import JSZip from 'jszip';\nexport const createArchive = () => new JSZip();\n"
  );

  expect(collectHeavyRuntimeImportOwnershipViolations([file], { rootDir: root })).toEqual([
    expect.objectContaining({
      rule: 'heavy-import-jszip-content',
      file: 'apps/extension/src/content/logic/archive.ts',
    }),
  ]);
}

function verifiesAllowedDompurifyImport() {
  const root = createTempRoot();
  const file = writeFile(
    root,
    '@sniptale/platform/security/sanitizers/html',
    "import DOMPurify from 'dompurify';\nexport const sanitize = (value) => DOMPurify.sanitize(value);\n"
  );

  expect(collectHeavyRuntimeImportOwnershipViolations([file], { rootDir: root })).toEqual([]);
}

function verifiesTypeOnlyImportIgnore() {
  const root = createTempRoot();
  const file = writeFile(
    root,
    'src/shared/types.ts',
    "import type { Something } from 'jszip';\nexport type Alias = Something;\n"
  );

  expect(collectHeavyRuntimeImportOwnershipViolations([file], { rootDir: root })).toEqual([]);
}

function verifiesInlineTypeOnlyImportIgnore() {
  const root = createTempRoot();
  const file = writeFile(
    root,
    'tooling/test/harness/editor/index.tsx',
    "import { type FabricObject } from 'fabric';\nexport type Alias = FabricObject;\n"
  );

  expect(collectHeavyRuntimeImportOwnershipViolations([file], { rootDir: root })).toEqual([]);
}

function verifiesTestHarnessFabricValueImportViolation() {
  const root = createTempRoot();
  const file = writeFile(
    root,
    'tooling/test/harness/editor/index.tsx',
    "import { Canvas } from 'fabric';\nexport const create = () => new Canvas();\n"
  );

  expect(collectHeavyRuntimeImportOwnershipViolations([file], { rootDir: root })).toEqual([
    expect.objectContaining({
      rule: 'heavy-import-fabric-owner',
      file: 'tooling/test/harness/editor/index.tsx',
    }),
  ]);
}

describe('collectHeavyRuntimeImportOwnershipViolations', () => {
  it('allows fabric imports in the editor runtime', verifiesAllowedFabricImport);
  it('flags fabric imports outside apps/extension/src/editor', verifiesForbiddenFabricImport);
  it('flags static jszip imports in content', verifiesForbiddenJszipImport);
  it('allows dompurify only in the shared sanitizer seam', verifiesAllowedDompurifyImport);
  it('ignores type-only imports', verifiesTypeOnlyImportIgnore);
  it('ignores inline type-only named imports', verifiesInlineTypeOnlyImportIgnore);
  it(
    'flags value fabric imports in the test harness',
    verifiesTestHarnessFabricValueImportViolation
  );
});
