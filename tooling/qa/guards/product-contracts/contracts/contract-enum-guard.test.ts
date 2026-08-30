import fs from 'node:fs';
import path from 'node:path';

import ts from 'typescript';
import { afterEach, expect, it } from 'vitest';

import {
  collectContractEnumViolations,
  isContractEnumGuardTarget,
} from './contract-enum-guard.mjs';

const createdFiles: string[] = [];

function writeFixture(relativePath: string, source: string) {
  const absolutePath = path.join(process.cwd(), relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, source);
  createdFiles.push(absolutePath);
  return relativePath;
}

afterEach(() => {
  for (const file of createdFiles.splice(0)) {
    fs.rmSync(file, { force: true });
  }
});

it('uses the TS6 compiler API and rejects enums in exact shared contract roots', () => {
  expect(ts.versionMajorMinor).toBe('6.0');
  const file = writeFixture(
    'apps/extension/src/contracts/__contract-enum-guard-fixture.ts',
    'export enum BoundaryKind { Message = "message" }\n'
  );

  expect(collectContractEnumViolations([file])).toEqual([
    expect.objectContaining({ file, line: 1, rule: 'contract-enum' }),
  ]);
});

it('accepts const-object unions and does not expand the retired ESLint scope', () => {
  const contractFile = writeFixture(
    'packages/runtime-contracts/src/__contract-enum-guard-fixture.ts',
    [
      'export const BoundaryKind = { Message: "message" } as const;',
      'export type BoundaryKind = (typeof BoundaryKind)[keyof typeof BoundaryKind];',
    ].join('\n')
  );
  const outsideFile = writeFixture(
    'packages/foundation/src/__contract-enum-guard-fixture.ts',
    'export enum InternalKind { Value = "value" }\n'
  );

  expect(isContractEnumGuardTarget(contractFile)).toBe(true);
  expect(isContractEnumGuardTarget(outsideFile)).toBe(false);
  expect(collectContractEnumViolations([contractFile, outsideFile])).toEqual([]);
});

it('keeps test fixtures outside the production contract restriction', () => {
  const file = writeFixture(
    'apps/extension/src/contracts/__contract-enum-guard-fixture.test.ts',
    'enum FixtureKind { Value = "value" }\n'
  );

  expect(isContractEnumGuardTarget(file)).toBe(false);
  expect(collectContractEnumViolations([file])).toEqual([]);
});
