import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { runDeadExportsCheck } from './verify-dead-exports.mjs';

const tempDirs: string[] = [];
const DEAD_EXPORT_TEST_TIMEOUT_MS = 15_000;

function writeFile(root: string, relativePath: string, contents: string) {
  const absolutePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, contents);
  return absolutePath;
}

function createTempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-dead-exports-public-surfaces-'));
  tempDirs.push(root);
  writeFile(
    root,
    'tsconfig.json',
    JSON.stringify({
      compilerOptions: {
        target: 'ES2020',
        module: 'ESNext',
        moduleResolution: 'bundler',
        strict: true,
      },
      include: ['src'],
    })
  );
  return root;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

function runTempDeadExportsCheck(root: string) {
  return runDeadExportsCheck({ tsConfigFilePath: path.join(root, 'tsconfig.json') });
}

function writesPublicContractSurfaces(root: string) {
  writeFile(
    root,
    'src/shared/contracts/example.ts',
    'export const ExampleContractVersion = 1;\nexport interface ExampleContract { value: string; }\n'
  );
  writeFile(
    root,
    'src/shared/contracts/schemas/example.ts',
    'export const ExampleSchema = { type: "object" };\nexport type ExampleSchemaType = { value: string; };\n'
  );
  writeFile(
    root,
    'src/shared/contracts/video/types/example.ts',
    'export const VideoType = "recording";\nexport interface VideoShape { id: string; }\n'
  );
}

describe('runDeadExportsCheck public surfaces', () => {
  it(
    'ignores public contract and schema surfaces',
    { timeout: DEAD_EXPORT_TEST_TIMEOUT_MS },
    () => {
      const root = createTempRoot();
      writesPublicContractSurfaces(root);

      const report = runTempDeadExportsCheck(root);

      expect(report.unusedValueExports).toEqual([]);
      expect(report.unusedTypeExports).toEqual([]);
    }
  );

  it(
    'ignores shared UI type surfaces without hiding unused values',
    { timeout: DEAD_EXPORT_TEST_TIMEOUT_MS },
    () => {
      const root = createTempRoot();
      writeFile(
        root,
        'src/shared/ui/button.tsx',
        'export interface ButtonProps { label: string; }\nexport function UnusedButton() { return null; }\n'
      );

      const report = runTempDeadExportsCheck(root);

      expect(report.unusedValueExports).toEqual([
        expect.objectContaining({
          file: 'src/shared/ui/button.tsx',
          exportName: 'UnusedButton',
        }),
      ]);
      expect(report.unusedTypeExports).toEqual([]);
    }
  );
});
