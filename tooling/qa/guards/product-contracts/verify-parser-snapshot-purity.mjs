/**
 * Parser snapshot purity guardrail.
 * Blocks parser/export seams from reaching back into live DOM/window globals instead of snapshot/IR data.
 */

import ts from 'typescript';

import { collectCodeFiles } from '../../analysis/repository/shared-files.mjs';
import {
  isExecutedAsScript,
  parseFilesArgument,
  printViolations,
} from '../../runtime/process/shared-cli.mjs';
import {
  getNodeLine,
  scanRepoScopedTypeScriptFiles,
} from '../../analysis/source/repo-scoped-typescript-scan.mjs';
import { resolveScopedTargetFiles } from '../../runtime/scope/target-files.helpers.mjs';

const TARGET_FILE_PATTERNS = [
  /^apps\/extension\/src\/content\/parser\/pipelines\/.+\.[cm]?[jt]sx?$/u,
  /^apps\/extension\/src\/content\/parser\/export-manager.+\.[cm]?[jt]sx?$/u,
];
const ALLOWLISTED_BOUNDARY_OWNERS = new Set([
  'apps/extension/src/content/parser/export-manager/diagnostics/source.ts',
]);
const OWNER_PATH = 'tooling/qa/guards/product-contracts/verify-parser-snapshot-purity.mjs';
const ALLOWED_WINDOW_PROPERTY_NAMES = new Set(['setTimeout', 'clearTimeout']);
const LIVE_GLOBAL_NAMES = new Set(['document', 'location', 'self', 'window']);

function createViolation(file, message, line) {
  return {
    rule: 'parser-snapshot-purity',
    file,
    line,
    message,
  };
}

function staticPropertyName(node) {
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  if (
    ts.isElementAccessExpression(node) &&
    node.argumentExpression &&
    (ts.isStringLiteral(node.argumentExpression) ||
      ts.isNoSubstitutionTemplateLiteral(node.argumentExpression))
  ) {
    return node.argumentExpression.text;
  }
  return null;
}

function accessPath(node) {
  const parts = [];
  let current = node;
  while (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)) {
    const name = staticPropertyName(current);
    if (!name) return null;
    parts.unshift(name);
    current = current.expression;
  }
  if (!ts.isIdentifier(current)) return null;
  parts.unshift(current.text);
  return {
    baseIdentifier: current,
    parts: parts[0] === 'globalThis' ? parts.slice(1) : parts,
    throughGlobalThis: parts[0] === 'globalThis',
  };
}

function collectBindingNames(name, target) {
  if (ts.isIdentifier(name)) {
    target.add(name.text);
    return;
  }

  for (const element of name.elements) {
    if (!ts.isOmittedExpression(element)) {
      collectBindingNames(element.name, target);
    }
  }
}

function collectDirectScopeBindings(scope) {
  const bindings = new Set();

  if (ts.isFunctionLike(scope)) {
    for (const parameter of scope.parameters) {
      collectBindingNames(parameter.name, bindings);
    }
  }

  if (ts.isCatchClause(scope) && scope.variableDeclaration) {
    collectBindingNames(scope.variableDeclaration.name, bindings);
  }

  if (!ts.isBlock(scope) && !ts.isSourceFile(scope) && !ts.isModuleBlock(scope)) {
    return bindings;
  }

  for (const statement of scope.statements) {
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        collectBindingNames(declaration.name, bindings);
      }
    } else if (
      (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) &&
      statement.name
    ) {
      bindings.add(statement.name.text);
    } else if (ts.isImportDeclaration(statement) && statement.importClause) {
      const { importClause } = statement;
      if (importClause.name) bindings.add(importClause.name.text);
      if (importClause.namedBindings) {
        if (ts.isNamespaceImport(importClause.namedBindings)) {
          bindings.add(importClause.namedBindings.name.text);
        } else {
          for (const element of importClause.namedBindings.elements) {
            bindings.add(element.name.text);
          }
        }
      }
    } else if (ts.isImportEqualsDeclaration(statement)) {
      bindings.add(statement.name.text);
    }
  }

  return bindings;
}

function isLocallyBound(identifier) {
  let current = identifier.parent;
  while (current) {
    if (collectDirectScopeBindings(current).has(identifier.text)) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

function isOutermostAccess(node) {
  return !(
    (ts.isPropertyAccessExpression(node.parent) || ts.isElementAccessExpression(node.parent)) &&
    node.parent.expression === node
  );
}

function classifyLiveGlobalAccess(path) {
  const [root, firstProperty] = path;
  if (root === 'document') return 'document';
  if (root === 'location') return 'location';
  if ((root === 'window' || root === 'self') && firstProperty === 'document') return 'document';
  if ((root === 'window' || root === 'self') && firstProperty === 'location') return 'location';
  if (
    (root === 'window' || root === 'self') &&
    (firstProperty === undefined || !ALLOWED_WINDOW_PROPERTY_NAMES.has(firstProperty))
  ) {
    return 'window';
  }
  return null;
}

function violationForGlobal(relativePath, sourceFile, node, globalKind) {
  const messages = {
    document: 'Parser/export seams must use snapshot or IR data instead of live document access.',
    location:
      'Parser/export seams must not read live location data directly; prefer snapshot/page profile data.',
    window:
      'Parser/export seams must not capture the mutable window/self global outside boundary owners.',
  };
  return createViolation(relativePath, messages[globalKind], getNodeLine(sourceFile, node));
}

function collectPropertyAccessViolations(relativePath, sourceFile, node) {
  if (
    (!ts.isPropertyAccessExpression(node) && !ts.isElementAccessExpression(node)) ||
    !isOutermostAccess(node)
  ) {
    return [];
  }

  const access = accessPath(node);
  if (!access || isLocallyBound(access.baseIdentifier)) return [];
  const globalKind = classifyLiveGlobalAccess(access.parts);
  return globalKind ? [violationForGlobal(relativePath, sourceFile, node, globalKind)] : [];
}

function isDeclarationOrPropertyName(node) {
  const { parent } = node;
  if (
    (ts.isVariableDeclaration(parent) ||
      ts.isParameter(parent) ||
      ts.isFunctionDeclaration(parent) ||
      ts.isFunctionExpression(parent) ||
      ts.isClassDeclaration(parent) ||
      ts.isMethodDeclaration(parent) ||
      ts.isPropertyDeclaration(parent) ||
      ts.isPropertySignature(parent) ||
      ts.isMethodSignature(parent) ||
      ts.isTypeAliasDeclaration(parent) ||
      ts.isInterfaceDeclaration(parent) ||
      ts.isImportClause(parent) ||
      ts.isImportSpecifier(parent) ||
      ts.isNamespaceImport(parent) ||
      ts.isImportEqualsDeclaration(parent)) &&
    parent.name === node
  ) {
    return true;
  }

  return (
    (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
    (ts.isPropertyAssignment(parent) && parent.name === node) ||
    (ts.isBindingElement(parent) && (parent.name === node || parent.propertyName === node))
  );
}

function isInsideTypeNode(node) {
  let current = node.parent;
  while (current && !ts.isStatement(current) && !ts.isExpression(current)) {
    if (ts.isTypeNode(current)) return true;
    current = current.parent;
  }
  return false;
}

function collectBareGlobalViolation(relativePath, sourceFile, node) {
  if (
    !ts.isIdentifier(node) ||
    !LIVE_GLOBAL_NAMES.has(node.text) ||
    isDeclarationOrPropertyName(node) ||
    isInsideTypeNode(node) ||
    isLocallyBound(node)
  ) {
    return [];
  }

  if (
    (ts.isPropertyAccessExpression(node.parent) || ts.isElementAccessExpression(node.parent)) &&
    node.parent.expression === node
  ) {
    return [];
  }

  const globalKind =
    node.text === 'document' ? 'document' : node.text === 'location' ? 'location' : 'window';
  return [violationForGlobal(relativePath, sourceFile, node, globalKind)];
}

function collectGlobalThisDestructuringViolation(relativePath, sourceFile, node) {
  if (
    !ts.isVariableDeclaration(node) ||
    !ts.isObjectBindingPattern(node.name) ||
    !node.initializer ||
    !ts.isIdentifier(node.initializer) ||
    node.initializer.text !== 'globalThis' ||
    isLocallyBound(node.initializer)
  ) {
    return [];
  }

  const staticBindingPropertyName = (element) => {
    const propertyName = element.propertyName ?? element.name;
    if (ts.isIdentifier(propertyName) || ts.isStringLiteral(propertyName)) {
      return propertyName.text;
    }
    if (
      ts.isComputedPropertyName(propertyName) &&
      (ts.isStringLiteral(propertyName.expression) ||
        ts.isNoSubstitutionTemplateLiteral(propertyName.expression))
    ) {
      return propertyName.expression.text;
    }
    return null;
  };
  const forbiddenElement = node.name.elements.find((element) =>
    LIVE_GLOBAL_NAMES.has(staticBindingPropertyName(element))
  );
  if (!forbiddenElement) return [];

  const propertyName = staticBindingPropertyName(forbiddenElement);
  const globalKind =
    propertyName === 'document' ? 'document' : propertyName === 'location' ? 'location' : 'window';
  return [violationForGlobal(relativePath, sourceFile, forbiddenElement, globalKind)];
}

export function collectParserSnapshotPurityViolations(files) {
  const violations = [];

  scanRepoScopedTypeScriptFiles(files, {
    allowlistedRelativePaths: ALLOWLISTED_BOUNDARY_OWNERS,
    targetFilePatterns: TARGET_FILE_PATTERNS,
    visitFile: ({ relativePath, sourceFile }) => {
      const visit = (node) => {
        violations.push(...collectPropertyAccessViolations(relativePath, sourceFile, node));
        violations.push(...collectBareGlobalViolation(relativePath, sourceFile, node));
        violations.push(...collectGlobalThisDestructuringViolation(relativePath, sourceFile, node));

        ts.forEachChild(node, visit);
      };

      visit(sourceFile);
    },
  });

  return violations;
}

export function runParserSnapshotPurityCheck({ files = [], scope = 'workspace' } = {}) {
  const needsFullClosure = files.some((file) => file.replaceAll('\\', '/').endsWith(OWNER_PATH));
  const targets = resolveScopedTargetFiles({
    files: needsFullClosure ? [] : files,
    scope: needsFullClosure ? 'repo-wide' : scope,
    collectFiles: collectCodeFiles,
  });
  const targetRelativeFiles = targets.relativeFiles;
  const targetFiles = targets.files;

  return {
    skipped: targetFiles.length === 0,
    files: targetRelativeFiles,
    violations: collectParserSnapshotPurityViolations(targetFiles),
  };
}

if (isExecutedAsScript(import.meta.url)) {
  const explicitFiles = parseFilesArgument(process.argv.slice(2));
  const result = runParserSnapshotPurityCheck({
    files: explicitFiles,
    scope: explicitFiles.length > 0 ? 'workspace' : 'repo-wide',
  });

  if (result.skipped) {
    process.stdout.write('Parser snapshot purity check skipped: no changed code files\n');
    process.exit(0);
  }

  if (result.violations.length > 0) {
    printViolations('Parser snapshot purity violations found:', result.violations);
    process.exit(1);
  }

  process.stdout.write('Parser snapshot purity guardrail passed\n');
}
