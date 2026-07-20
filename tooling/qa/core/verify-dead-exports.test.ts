import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  formatDeadExportsReport,
  runDeadExportsCheck,
  summarizeDeadExportsReport,
} from './verify-dead-exports.mjs';

const tempDirs: string[] = [];
const DEAD_EXPORT_TEST_TIMEOUT_MS = 15_000;

function writeFile(root: string, relativePath: string, contents: string) {
  const absolutePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, contents);
  return absolutePath;
}

function createTempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-dead-exports-'));
  tempDirs.push(root);
  return root;
}

function writeTsConfig(root: string) {
  writeFile(
    root,
    'tsconfig.json',
    JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2020',
          module: 'ESNext',
          moduleResolution: 'bundler',
          strict: true,
        },
        include: ['packages/foundation/src'],
      },
      null,
      2
    )
  );
}

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

function verifiesUnusedValueExportReport() {
  const root = createTempRoot();
  writeTsConfig(root);
  writeFile(root, 'packages/foundation/src/example.ts', 'export const unusedValue = 1;\n');

  const report = runDeadExportsCheck({ tsConfigFilePath: path.join(root, 'tsconfig.json') });

  expect(report.unusedValueExports).toEqual([
    expect.objectContaining({
      file: 'packages/foundation/src/example.ts',
      exportName: 'unusedValue',
    }),
  ]);
}

function verifiesBarrelReExportUsage() {
  const root = createTempRoot();
  writeTsConfig(root);
  writeFile(root, 'packages/foundation/src/example.ts', 'export const usedValue = 1;\n');
  writeFile(root, 'packages/foundation/src/index.ts', "export { usedValue } from './example';\n");

  const report = runDeadExportsCheck({ tsConfigFilePath: path.join(root, 'tsconfig.json') });

  expect(report.unusedValueExports).toEqual([]);
}

function verifiesUnusedTypeExportReport() {
  const root = createTempRoot();
  writeTsConfig(root);
  writeFile(
    root,
    'packages/foundation/src/example.ts',
    'export interface ExampleShape { value: string; }\n'
  );

  const report = runDeadExportsCheck({ tsConfigFilePath: path.join(root, 'tsconfig.json') });

  expect(report.unusedValueExports).toEqual([]);
  expect(report.unusedTypeExports).toEqual([
    expect.objectContaining({
      file: 'packages/foundation/src/example.ts',
      exportName: 'ExampleShape',
    }),
  ]);
}

function verifiesSummaryCounts() {
  const root = createTempRoot();
  writeTsConfig(root);
  writeFile(
    root,
    'packages/foundation/src/example.ts',
    'export const unusedValue = 1;\nexport interface ExampleShape { value: string; }\n'
  );

  const summary = summarizeDeadExportsReport(
    runDeadExportsCheck({ tsConfigFilePath: path.join(root, 'tsconfig.json') })
  );

  expect(summary).toEqual({
    unusedValueExportCount: 1,
    unusedTypeExportCount: 1,
  });
}

function verifiesFormattedReportListsUnusedExports() {
  const report = {
    unusedValueExports: [
      {
        exportName: 'unusedValue',
        file: 'packages/foundation/src/example.ts',
        kind: 'VariableDeclaration',
      },
    ],
    unusedTypeExports: [
      {
        exportName: 'ExampleShape',
        file: 'packages/foundation/src/example.ts',
        kind: 'InterfaceDeclaration',
      },
    ],
  };

  expect(formatDeadExportsReport(report)).toContain(
    [
      'Unused value exports:',
      '- packages/foundation/src/example.ts :: unusedValue (VariableDeclaration)',
      '',
      'Unused type exports:',
      '- packages/foundation/src/example.ts :: ExampleShape (InterfaceDeclaration)',
      '',
      'Dead exports report completed (1 value, 1 type)',
    ].join('\n')
  );
}

function verifiesCanonicalFacadeIgnoreList() {
  const root = createTempRoot();
  writeTsConfig(root);
  writeFile(
    root,
    'packages/platform/src/browser/app-facade-removal.test.ts',
    'export const unusedFacadeValue = 1;\n'
  );

  const report = runDeadExportsCheck({ tsConfigFilePath: path.join(root, 'tsconfig.json') });

  expect(report.unusedValueExports).toEqual([]);
  expect(report.unusedTypeExports).toEqual([]);
}

function verifiesSameNameOwnerFacadeIgnore() {
  const root = createTempRoot();
  writeTsConfig(root);
  writeFile(
    root,
    'packages/foundation/src/feature/panel.ts',
    "export { PanelView } from './panel/view';\n"
  );
  writeFile(
    root,
    'packages/foundation/src/feature/panel/view.ts',
    'export function PanelView() { return null; }\n'
  );

  const report = runDeadExportsCheck({ tsConfigFilePath: path.join(root, 'tsconfig.json') });

  expect(report.unusedValueExports).toEqual([]);
  expect(report.unusedTypeExports).toEqual([]);
}

function verifiesReExportFacadeDeclarationsAreNotReportedAsLocalDeadExports() {
  const root = createTempRoot();
  writeTsConfig(root);
  writeFile(
    root,
    'packages/foundation/src/feature/shared.ts',
    "export { usedValue } from './value';\n"
  );
  writeFile(root, 'packages/foundation/src/feature/value.ts', 'export const usedValue = 1;\n');
  writeFile(
    root,
    'packages/foundation/src/consumer.ts',
    "import { usedValue } from './feature/shared';\nvoid usedValue;\n"
  );

  const report = runDeadExportsCheck({ tsConfigFilePath: path.join(root, 'tsconfig.json') });

  expect(report.unusedValueExports).toEqual([]);
  expect(report.unusedTypeExports).toEqual([]);
}

function verifiesDynamicImportUsage() {
  const root = createTempRoot();
  writeTsConfig(root);
  writeFile(root, 'packages/foundation/src/example.ts', 'export const lazyValue = 1;\n');
  writeFile(
    root,
    'packages/foundation/src/consumer.ts',
    "async function loadExample() { return import('./example'); }\nvoid loadExample;\n"
  );

  const report = runDeadExportsCheck({ tsConfigFilePath: path.join(root, 'tsconfig.json') });

  expect(report.unusedValueExports).toEqual([]);
}

describe('runDeadExportsCheck', () => {
  it(
    'reports unused exported values',
    { timeout: DEAD_EXPORT_TEST_TIMEOUT_MS },
    verifiesUnusedValueExportReport
  );

  it(
    'treats barrel re-exports as usage while ignoring the barrel file itself',
    { timeout: DEAD_EXPORT_TEST_TIMEOUT_MS },
    verifiesBarrelReExportUsage
  );

  it(
    'reports unused type exports separately',
    { timeout: DEAD_EXPORT_TEST_TIMEOUT_MS },
    verifiesUnusedTypeExportReport
  );

  it(
    'summarizes unused export counts for advisory wrappers',
    { timeout: DEAD_EXPORT_TEST_TIMEOUT_MS },
    verifiesSummaryCounts
  );

  it(
    'formats concrete unused exports for wrapper reports',
    verifiesFormattedReportListsUnusedExports
  );
});

describe('runDeadExportsCheck ignored surfaces', () => {
  it(
    'ignores canonical shared facade files',
    { timeout: DEAD_EXPORT_TEST_TIMEOUT_MS },
    verifiesCanonicalFacadeIgnoreList
  );

  it(
    'ignores same-name owner facades that are validated by the canonical facade guardrail',
    { timeout: DEAD_EXPORT_TEST_TIMEOUT_MS },
    verifiesSameNameOwnerFacadeIgnore
  );

  it(
    'does not report re-export facade declarations as locally owned dead exports',
    { timeout: DEAD_EXPORT_TEST_TIMEOUT_MS },
    verifiesReExportFacadeDeclarationsAreNotReportedAsLocalDeadExports
  );

  it(
    'treats dynamic imports as usage for lazily loaded modules',
    { timeout: DEAD_EXPORT_TEST_TIMEOUT_MS },
    verifiesDynamicImportUsage
  );
});
