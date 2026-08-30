/**
 * Blocking UI automation seam policy.
 * Reports browser-owned automation primitives in production orchestration files outside explicit owners.
 */

import ts from 'typescript';

import { collectCodeFiles } from '../../../analysis/repository/shared-files.mjs';
import { toRelativePath } from '../../../analysis/repository/shared-paths.mjs';
import { isExecutedAsScript } from '../../../runtime/process/shared-cli.mjs';
import {
  emitScopedReportCliResult,
  parseScopedReportCliArgs,
} from '../../../composition/runtime/scoped-report-cli.mjs';
import {
  getNodeLine,
  scanRepoScopedTypeScriptFiles,
} from '../../../analysis/source/repo-scoped-typescript-scan.mjs';
import { resolveScopedTargetFiles } from '../../../runtime/scope/target-files.helpers.mjs';

const TARGET_FILE_PATTERNS = [/^apps\/extension\/src\/content\/.+\.[cm]?[jt]sx?$/u];
const HOST_PAGE_CLICK_OWNER_PATTERN = /^apps\/extension\/src\/content\/parser\/host-page-click\//u;
const POPUP_EXPORT_DOM_DRIVER_OWNER_PATTERN =
  /^apps\/extension\/src\/content\/parser\/popup-export\/dom-(?:driver|runtime)\.[cm]?[jt]s$/u;

function createViolation(file, line, message) {
  return {
    rule: 'ui-automation-seams',
    file,
    line,
    message,
  };
}

function resolveTargetFiles({ files = [], scope = 'workspace' } = {}) {
  return resolveScopedTargetFiles({
    files,
    scope,
    collectFiles: collectCodeFiles,
  }).files;
}

function isGlobalOwner(node) {
  return ts.isIdentifier(node) && (node.text === 'globalThis' || node.text === 'window');
}

function isUnshadowedIdentifier(node, name, declaredNames) {
  return ts.isIdentifier(node) && node.text === name && !declaredNames.has(name);
}

function isGlobalPrimitive(expression, primitiveName, declaredNames) {
  return (
    isUnshadowedIdentifier(expression, primitiveName, declaredNames) ||
    (ts.isPropertyAccessExpression(expression) &&
      isGlobalOwner(expression.expression) &&
      !declaredNames.has(expression.expression.text) &&
      expression.name.text === primitiveName)
  );
}

function unwrapExpression(node) {
  if (
    ts.isParenthesizedExpression(node) ||
    ts.isNonNullExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isTypeAssertionExpression(node)
  ) {
    return unwrapExpression(node.expression);
  }
  return node;
}

function isDocumentRootedExpression(node, domBindings, declaredNames) {
  const expression = unwrapExpression(node);
  if (ts.isIdentifier(expression)) {
    return (
      domBindings.has(expression.text) ||
      (expression.text === 'document' && !declaredNames.has('document'))
    );
  }
  if (ts.isPropertyAccessExpression(expression) || ts.isElementAccessExpression(expression)) {
    return isDocumentRootedExpression(expression.expression, domBindings, declaredNames);
  }
  if (ts.isCallExpression(expression)) {
    return isDocumentRootedExpression(expression.expression, domBindings, declaredNames);
  }
  return false;
}

function isDomClickCall(node, domBindings, declaredNames) {
  return (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    node.expression.name.text === 'click' &&
    isDocumentRootedExpression(node.expression.expression, domBindings, declaredNames)
  );
}

function collectDeclaredNames(sourceFile) {
  const names = new Set();
  function visit(node) {
    if (
      (ts.isVariableDeclaration(node) ||
        ts.isParameter(node) ||
        ts.isFunctionDeclaration(node) ||
        ts.isClassDeclaration(node) ||
        ts.isImportClause(node) ||
        ts.isImportSpecifier(node)) &&
      node.name &&
      ts.isIdentifier(node.name)
    ) {
      names.add(node.name.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return names;
}

function collectImportedKeyboardResolverBindings(sourceFile) {
  const bindings = new Set();
  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !statement.importClause?.namedBindings ||
      !ts.isNamedImports(statement.importClause.namedBindings)
    ) {
      continue;
    }
    for (const element of statement.importClause.namedBindings.elements) {
      if ((element.propertyName ?? element.name).text === 'resolveKeyboardEventConstructor') {
        bindings.add(element.name.text);
      }
    }
  }
  return bindings;
}

function collectAutomationBindings(sourceFile, declaredNames) {
  const domBindings = new Set();
  const keyboardConstructorBindings = new Set();
  const keyboardResolverBindings = collectImportedKeyboardResolverBindings(sourceFile);

  let changed = true;
  while (changed) {
    changed = false;
    function addBinding(bindings, name) {
      if (!bindings.has(name)) {
        bindings.add(name);
        changed = true;
      }
    }
    function visit(node) {
      if (
        ts.isParameter(node) &&
        ts.isIdentifier(node.name) &&
        node.type &&
        /^(?:HTML\w*Element|Document)$/u.test(node.type.getText(sourceFile))
      ) {
        addBinding(domBindings, node.name.text);
      }
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
        const initializer = unwrapExpression(node.initializer);
        if (isDocumentRootedExpression(initializer, domBindings, declaredNames)) {
          addBinding(domBindings, node.name.text);
        }
        if (
          isGlobalPrimitive(initializer, 'KeyboardEvent', declaredNames) ||
          (ts.isIdentifier(initializer) && keyboardConstructorBindings.has(initializer.text)) ||
          (ts.isCallExpression(initializer) &&
            ts.isIdentifier(initializer.expression) &&
            keyboardResolverBindings.has(initializer.expression.text))
        ) {
          addBinding(keyboardConstructorBindings, node.name.text);
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(sourceFile);
  }

  return { domBindings, keyboardConstructorBindings };
}

function isKeyboardEventConstruction(node, keyboardConstructorBindings, declaredNames) {
  const expression = ts.isNewExpression(node) ? unwrapExpression(node.expression) : null;
  return (
    expression !== null &&
    (isGlobalPrimitive(expression, 'KeyboardEvent', declaredNames) ||
      (ts.isIdentifier(expression) && keyboardConstructorBindings.has(expression.text)))
  );
}

function isProductionUiAutomationFile(relativePath) {
  return !relativePath.includes('.test-support.');
}

export function collectUiAutomationSeamViolations(files) {
  const violations = [];

  scanRepoScopedTypeScriptFiles(files, {
    targetFilePatterns: TARGET_FILE_PATTERNS,
    visitFile: ({ normalizedPath, relativePath, sourceFile }) => {
      if (!isProductionUiAutomationFile(relativePath)) return;
      const declaredNames = collectDeclaredNames(sourceFile);
      const { domBindings, keyboardConstructorBindings } = collectAutomationBindings(
        sourceFile,
        declaredNames
      );
      const visit = (node) => {
        if (
          isKeyboardEventConstruction(node, keyboardConstructorBindings, declaredNames) &&
          !POPUP_EXPORT_DOM_DRIVER_OWNER_PATTERN.test(normalizedPath)
        ) {
          violations.push(
            createViolation(
              relativePath,
              getNodeLine(sourceFile, node),
              'KeyboardEvent-driven UI automation must stay inside the popup-export DOM-driver owner.'
            )
          );
        }

        if (
          isDomClickCall(node, domBindings, declaredNames) &&
          !HOST_PAGE_CLICK_OWNER_PATTERN.test(normalizedPath)
        ) {
          violations.push(
            createViolation(
              relativePath,
              getNodeLine(sourceFile, node),
              'Programmatic host-page clicks must stay inside the host-page-click owner.'
            )
          );
        }

        ts.forEachChild(node, visit);
      };

      visit(sourceFile);
    },
  });

  return violations;
}

export function runUiAutomationSeamCheck({ files = [], scope = 'workspace' } = {}) {
  const targetFiles = resolveTargetFiles({ files, scope });

  return {
    skipped: targetFiles.length === 0,
    files: targetFiles.map(toRelativePath),
    violations: collectUiAutomationSeamViolations(targetFiles),
  };
}

export function runChangedUiAutomationSeamCheck() {
  return runUiAutomationSeamCheck({ scope: 'workspace' });
}

if (isExecutedAsScript(import.meta.url)) {
  const { explicitFiles, reportOnly, repoWide, scope } = parseScopedReportCliArgs(
    process.argv.slice(2)
  );
  const result = runUiAutomationSeamCheck({
    files: explicitFiles,
    scope,
  });

  process.exit(
    emitScopedReportCliResult({
      labels: {
        failureHeader: 'UI automation seam violations found:',
        passedRepoWide: 'UI automation seam repo report passed\n',
        passedWorkspace: 'UI automation seam guardrail passed\n',
        reportOnlyHeader: 'UI automation seam violations found:',
        skippedRepoWide: 'UI automation seam repo report skipped: no code files\n',
        skippedWorkspace: 'UI automation seam check skipped: no changed code files\n',
      },
      repoWide,
      reportOnly,
      result,
    })
  );
}
