import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const CAPABILITY_FILE_PATTERN = /capabilit/iu;
const MUTATION_QUEUE_NAME_PATTERN = /(?:queue|pending|buffer|jobs|requests)/iu;
const MUTABLE_COLLECTION_NAMES = new Set(['Map', 'Set']);

export function readArchitectureFileText(root, relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

export function architectureFileExists(root, relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

export function isCapabilityStatePath(file) {
  return CAPABILITY_FILE_PATTERN.test(file);
}

export function hasResetForTestsSignal(text) {
  return /\breset[A-Za-z0-9]*ForTests\b/u.test(text);
}

export function hasPrivilegedMemoryDomainSignal(text) {
  return /\bcreatePrivilegedSyncMemoryDomain\b/u.test(text);
}

function isTopLevelMapOrSet(declaration) {
  return (
    declaration.initializer &&
    ts.isNewExpression(declaration.initializer) &&
    ts.isIdentifier(declaration.initializer.expression) &&
    MUTABLE_COLLECTION_NAMES.has(declaration.initializer.expression.text)
  );
}

export function collectTopLevelAuthorityStateReasons(sourceFile) {
  const reasons = new Set();
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (isTopLevelMapOrSet(declaration)) reasons.add('top-level-map-or-set');
      if (
        ts.isIdentifier(declaration.name) &&
        MUTATION_QUEUE_NAME_PATTERN.test(declaration.name.text)
      ) {
        reasons.add('mutation-queue-name');
      }
    }
  }
  return [...reasons];
}
