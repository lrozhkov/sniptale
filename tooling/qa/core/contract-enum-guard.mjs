import fs from 'node:fs';
import ts from 'typescript';

import { getNodeLine } from './repo-scoped-typescript-scan.mjs';
import { fromRelativePath, toRelativePath } from './shared.mjs';

export const CONTRACT_ENUM_ROOTS = Object.freeze([
  'apps/extension/src/contracts/',
  'packages/runtime-contracts/src/',
]);

const TYPESCRIPT_FILE_PATTERN = /[.]tsx?$/u;
const TEST_FILE_PATTERN = /[.](?:test|spec)[.]tsx?$/u;

export function isContractEnumGuardTarget(file) {
  const relativePath = toRelativePath(file);
  return (
    TYPESCRIPT_FILE_PATTERN.test(relativePath) &&
    !TEST_FILE_PATTERN.test(relativePath) &&
    CONTRACT_ENUM_ROOTS.some((root) => relativePath.startsWith(root))
  );
}

export function collectContractEnumViolations(files = []) {
  const violations = [];

  for (const file of files) {
    const relativePath = toRelativePath(file);
    if (!isContractEnumGuardTarget(relativePath)) {
      continue;
    }

    const sourceFile = ts.createSourceFile(
      relativePath,
      fs.readFileSync(fromRelativePath(relativePath), 'utf8'),
      ts.ScriptTarget.Latest,
      true
    );
    const visit = (node) => {
      if (ts.isEnumDeclaration(node)) {
        violations.push({
          rule: 'contract-enum',
          file: relativePath,
          line: getNodeLine(sourceFile, node),
          column: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).character + 1,
          message: 'Shared contracts must use const objects plus union types instead of enums.',
        });
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }

  return violations;
}

export function formatContractEnumViolations(violations) {
  return violations
    .map(
      ({ column, file, line, message, rule }) => `${file}:${line}:${column}: ${message} [${rule}]`
    )
    .join('\n');
}
