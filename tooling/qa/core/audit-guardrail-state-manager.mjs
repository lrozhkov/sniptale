import ts from 'typescript';

import { createViolation } from './audit-guardrail-shared.mjs';
import { getNodeLine, scanRepoScopedTypeScriptFiles } from './repo-scoped-typescript-scan.mjs';

const STATE_MANAGER_AUTHORITY_MESSAGE = [
  'Chrome storage entrypoints must stay behind StateManager browser-storage domains',
  'instead of direct chrome.storage access.',
].join(' ');
const STATE_MANAGER_AUTHORITY_OWNER_PATTERNS = [
  /^packages\/platform\/src\/browser\/content-runtime-shim\.ts$/u,
  /^apps\/extension\/src\/composition\/persistence\/infrastructure\/browser-storage\/(?:area-adapter|index)\.ts$/u,
  /^apps\/extension\/src\/composition\/persistence\/infrastructure\/mutation-barrier\.ts$/u,
  /^apps\/extension\/src\/composition\/persistence\/state-manager\//u,
];
const STATE_MANAGER_DEFAULT_IMPORT_MESSAGE = [
  'Default stateManager singleton imports must stay in approved infrastructure or legacy owners.',
  'Business code should import StateManager types or receive a store/service dependency.',
].join(' ');
const STATE_MANAGER_DEFAULT_IMPORT_OWNER_PATTERNS = [
  /^apps\/extension\/src\/composition\/persistence\/state-manager\//u,
  /^apps\/extension\/src\/composition\/persistence\/infrastructure\/browser-storage\/(?:area-adapter|index)\.ts$/u,
  /^apps\/extension\/src\/composition\/persistence\/infrastructure\/indexed-db\/core\.ts$/u,
  /^apps\/extension\/src\/background\/routing-contracts\/capabilities\/privileged-authority\/state\.ts$/u,
  /^apps\/extension\/src\/background\/capture\/jobs\/default-service\.ts$/u,
];

function isStateManagerAuthorityOwner(normalizedPath) {
  return STATE_MANAGER_AUTHORITY_OWNER_PATTERNS.some((pattern) => pattern.test(normalizedPath));
}

function isStateManagerDefaultImportOwner(normalizedPath) {
  return STATE_MANAGER_DEFAULT_IMPORT_OWNER_PATTERNS.some((pattern) =>
    pattern.test(normalizedPath)
  );
}

function createStateManagerAuthorityViolation(normalizedPath, sourceFile, node) {
  return createViolation(
    'state-manager-authority-owner-bypass',
    normalizedPath,
    getNodeLine(sourceFile, node),
    STATE_MANAGER_AUTHORITY_MESSAGE
  );
}

function createStateManagerDefaultImportViolation(normalizedPath, sourceFile, node) {
  return createViolation(
    'state-manager-default-singleton-import',
    normalizedPath,
    getNodeLine(sourceFile, node),
    STATE_MANAGER_DEFAULT_IMPORT_MESSAGE
  );
}

function isDirectChromeStorageAccess(node) {
  return (
    ts.isPropertyAccessExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === 'chrome' &&
    node.name.text === 'storage'
  );
}

function isStateManagerModuleSpecifier(specifier) {
  return /(?:^|\/)state-manager(?:\/index|\/default-state-manager)?$/u.test(specifier);
}

function hasStateManagerNamedBinding(namedBindings) {
  return namedBindings.elements.some((element) => element.name.text === 'stateManager');
}

function isStateManagerDefaultSingletonImport(node) {
  if (
    !ts.isImportDeclaration(node) ||
    !ts.isStringLiteral(node.moduleSpecifier) ||
    !isStateManagerModuleSpecifier(node.moduleSpecifier.text)
  ) {
    return false;
  }
  const namedBindings = node.importClause?.namedBindings;
  return namedBindings && ts.isNamedImports(namedBindings)
    ? hasStateManagerNamedBinding(namedBindings)
    : false;
}

function isStateManagerDefaultSingletonReExport(node) {
  if (
    !ts.isExportDeclaration(node) ||
    !node.exportClause ||
    !ts.isNamedExports(node.exportClause) ||
    !node.moduleSpecifier ||
    !ts.isStringLiteral(node.moduleSpecifier) ||
    !isStateManagerModuleSpecifier(node.moduleSpecifier.text)
  ) {
    return false;
  }
  return node.exportClause.elements.some((element) => element.name.text === 'stateManager');
}

function collectStateManagerViolations(files, { createNodeViolation, isOwner, isViolationNode }) {
  const violations = [];

  scanRepoScopedTypeScriptFiles(files, {
    includeTestLikeFiles: false,
    targetFilePatterns: [/^(?:apps\/extension\/src|packages\/[^/]+\/src)\//u],
    visitFile: ({ normalizedPath, sourceFile }) => {
      if (isOwner(normalizedPath)) return;

      const visit = (node) => {
        if (isViolationNode(node)) {
          violations.push(createNodeViolation(normalizedPath, sourceFile, node));
          return;
        }
        ts.forEachChild(node, visit);
      };
      ts.forEachChild(sourceFile, visit);
    },
  });

  return violations;
}

export function collectStateManagerAuthorityViolations(files) {
  return collectStateManagerViolations(files, {
    createNodeViolation: createStateManagerAuthorityViolation,
    isOwner: isStateManagerAuthorityOwner,
    isViolationNode: isDirectChromeStorageAccess,
  });
}

export function collectStateManagerDefaultImportViolations(files) {
  return collectStateManagerViolations(files, {
    createNodeViolation: createStateManagerDefaultImportViolation,
    isOwner: isStateManagerDefaultImportOwner,
    isViolationNode: (node) =>
      isStateManagerDefaultSingletonImport(node) || isStateManagerDefaultSingletonReExport(node),
  });
}
