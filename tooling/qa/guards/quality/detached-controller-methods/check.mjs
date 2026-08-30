import ts from 'typescript';

import { collectRecursiveFiles } from '../../../analysis/repository/recursive-files.mjs';
import { collectCodeFiles } from '../../../analysis/repository/shared-files.mjs';
import { fromRelativePath } from '../../../analysis/repository/shared-paths.mjs';
import { getSourceSnapshot } from '../../../analysis/source/source-snapshot.mjs';
import { isExecutedAsScript } from '../../../runtime/process/shared-cli.mjs';
import {
  getNodeLine,
  runScopedCodeFileCheck,
  scanRepoScopedTypeScriptFiles,
} from '../../../analysis/source/repo-scoped-typescript-scan.mjs';
import {
  emitScopedReportCliResult,
  parseScopedReportCliArgs,
} from '../../../composition/runtime/scoped-report-cli.mjs';

const TARGET_FILE_PATTERNS = [/^apps\/extension\/src\/editor\/.+\.[cm]?[jt]sx?$/u];
const CONTROLLER_CORE_ROOT = 'apps/extension/src/editor/controller/core';
const RAW_CONTROLLER_TYPE_MARKERS = ['ImageEditorController', 'useEditorController'];
const ADAPTER_CONTROLLER_TYPE_MARKERS = ['EditorControllerPublicApiAdapter'];
const CONTROLLER_PROPERTY_NAME = 'controller';

function typeText(sourceFile, node) {
  return node?.getText(sourceFile).replace(/\s+/gu, '') ?? '';
}

function includesAnyMarker(text, markers) {
  return markers.some((marker) => text.includes(marker));
}

function isRawControllerType(sourceFile, typeNode) {
  const text = typeText(sourceFile, typeNode);
  return (
    includesAnyMarker(text, RAW_CONTROLLER_TYPE_MARKERS) &&
    !includesAnyMarker(text, ADAPTER_CONTROLLER_TYPE_MARKERS)
  );
}

function isAdapterControllerType(sourceFile, typeNode) {
  return includesAnyMarker(typeText(sourceFile, typeNode), ADAPTER_CONTROLLER_TYPE_MARKERS);
}

function getPropertyNameText(name) {
  return ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : null;
}

function collectControllerTypeNames(sourceFile) {
  const rawContainers = new Set();
  const adapterContainers = new Set();
  const visitMember = (typeName, member) => {
    if (
      !ts.isPropertySignature(member) ||
      !member.type ||
      getPropertyNameText(member.name) !== CONTROLLER_PROPERTY_NAME
    ) {
      return;
    }
    if (isRawControllerType(sourceFile, member.type)) rawContainers.add(typeName);
    if (isAdapterControllerType(sourceFile, member.type)) adapterContainers.add(typeName);
  };
  const visit = (node) => {
    if (ts.isInterfaceDeclaration(node)) {
      for (const member of node.members) visitMember(node.name.text, member);
    }
    if (ts.isTypeAliasDeclaration(node) && ts.isTypeLiteralNode(node.type)) {
      for (const member of node.type.members) visitMember(node.name.text, member);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return { rawContainers, adapterContainers };
}

function classifyControllerContainerType(sourceFile, typeNode) {
  if (!typeNode || !ts.isTypeLiteralNode(typeNode)) return null;
  for (const member of typeNode.members) {
    if (
      ts.isPropertySignature(member) &&
      member.type &&
      getPropertyNameText(member.name) === CONTROLLER_PROPERTY_NAME
    ) {
      if (isRawControllerType(sourceFile, member.type)) return 'raw';
      if (isAdapterControllerType(sourceFile, member.type)) return 'adapter';
    }
  }
  return null;
}

function unwrapExpression(node) {
  let current = node;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function classifyControllerReceiver(receiver, state) {
  const current = unwrapExpression(receiver);
  if (ts.isIdentifier(current)) {
    if (state.rawControllerIdentifiers.has(current.text)) return 'raw';
    if (state.adapterControllerIdentifiers.has(current.text)) return 'adapter';
    return null;
  }
  if (
    !ts.isPropertyAccessExpression(current) ||
    current.name.text !== CONTROLLER_PROPERTY_NAME ||
    !ts.isIdentifier(current.expression)
  ) {
    return null;
  }
  if (state.rawControllerContainerIdentifiers.has(current.expression.text)) return 'raw';
  if (state.adapterControllerContainerIdentifiers.has(current.expression.text)) return 'adapter';
  return null;
}

function addTypedIdentifier(sourceFile, node, state) {
  if (!ts.isIdentifier(node.name)) return;
  const containerKind = classifyControllerContainerType(sourceFile, node.type);
  if (containerKind === 'raw') state.rawControllerContainerIdentifiers.add(node.name.text);
  if (containerKind === 'adapter') state.adapterControllerContainerIdentifiers.add(node.name.text);
  if (node.type && isRawControllerType(sourceFile, node.type)) {
    state.rawControllerIdentifiers.add(node.name.text);
  }
  if (node.type && isAdapterControllerType(sourceFile, node.type)) {
    state.adapterControllerIdentifiers.add(node.name.text);
  }
  const declaredType = typeText(sourceFile, node.type);
  if (state.rawContainerTypeNames.has(declaredType)) {
    state.rawControllerContainerIdentifiers.add(node.name.text);
  }
  if (state.adapterContainerTypeNames.has(declaredType)) {
    state.adapterControllerContainerIdentifiers.add(node.name.text);
  }
}

function collectControllerIdentifierState(sourceFile) {
  const { rawContainers, adapterContainers } = collectControllerTypeNames(sourceFile);
  const state = {
    adapterContainerTypeNames: adapterContainers,
    adapterControllerContainerIdentifiers: new Set(),
    adapterControllerIdentifiers: new Set(),
    rawContainerTypeNames: rawContainers,
    rawControllerContainerIdentifiers: new Set(),
    rawControllerIdentifiers: new Set(),
  };
  const declarations = [];
  const visit = (node) => {
    if (ts.isParameter(node) || ts.isVariableDeclaration(node))
      addTypedIdentifier(sourceFile, node, state);
    if (ts.isVariableDeclaration(node)) {
      declarations.push(node);
      if (
        ts.isIdentifier(node.name) &&
        node.initializer &&
        ts.isCallExpression(node.initializer) &&
        node.initializer.expression.getText(sourceFile) === 'useEditorController'
      ) {
        state.rawControllerIdentifiers.add(node.name.text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  let changed = true;
  while (changed) {
    changed = false;
    for (const declaration of declarations) {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue;
      const kind = classifyControllerReceiver(declaration.initializer, state);
      const target =
        kind === 'raw'
          ? state.rawControllerIdentifiers
          : kind === 'adapter'
            ? state.adapterControllerIdentifiers
            : null;
      if (target && !target.has(declaration.name.text)) {
        target.add(declaration.name.text);
        changed = true;
      }
    }
  }
  return state;
}

function isDirectInvocation(node) {
  return ts.isCallExpression(node.parent) && node.parent.expression === node;
}

function isSafelyBoundToReceiver(node) {
  const bindAccess = node.parent;
  if (
    !ts.isPropertyAccessExpression(bindAccess) ||
    bindAccess.expression !== node ||
    bindAccess.name.text !== 'bind' ||
    !ts.isCallExpression(bindAccess.parent) ||
    bindAccess.parent.expression !== bindAccess ||
    bindAccess.parent.arguments.length === 0
  ) {
    return false;
  }
  return bindAccess.parent.arguments[0]?.getText() === node.expression.getText();
}

function isMethodReference(node) {
  return !isDirectInvocation(node) && !isSafelyBoundToReceiver(node);
}

function collectCanonicalControllerMethodNames() {
  const files = collectRecursiveFiles(fromRelativePath(CONTROLLER_CORE_ROOT), {
    returnAbsolute: true,
    predicate: (file) =>
      /\.[cm]?[jt]sx?$/u.test(file) && !/\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(file),
  });
  const names = new Set();
  for (const file of files) {
    const sourceFile = getSourceSnapshot({ filePath: file }).sourceFile;
    const visit = (node) => {
      if (ts.isMethodDeclaration(node)) {
        const name = getPropertyNameText(node.name);
        if (name) names.add(name);
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  return names;
}

function createViolation({ file, line, methodName, rule }) {
  const isAdapterInventory = rule === 'adapter-controller-method-inventory';
  return {
    rule,
    file,
    line,
    message: isAdapterInventory
      ? [
          `Adapter method "${methodName}" crosses a callback boundary as a method reference.`,
          'This is report-only inventory because EditorControllerPublicApiAdapter wraps the instance.',
        ].join(' ')
      : [
          `Controller method "${methodName}" crosses a callback boundary as a raw method reference.`,
          'Wrap it in a closure so ImageEditorController keeps its instance binding.',
        ].join(' '),
  };
}

function collectFileDetachedControllerMethodViolations({
  includeAdapterInventory,
  methodNames,
  relativePath,
  sourceFile,
}) {
  const violations = [];
  const state = collectControllerIdentifierState(sourceFile);

  const visit = (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isObjectBindingPattern(node.name) &&
      node.initializer
    ) {
      const receiverKind = classifyControllerReceiver(node.initializer, state);
      for (const element of node.name.elements) {
        const methodName = getPropertyNameText(element.propertyName ?? element.name);
        if (!methodName || !methodNames.has(methodName)) continue;
        if (receiverKind === 'raw') {
          violations.push(
            createViolation({
              file: relativePath,
              line: getNodeLine(sourceFile, element),
              methodName,
              rule: 'detached-controller-method',
            })
          );
        }
        if (receiverKind === 'adapter' && includeAdapterInventory) {
          violations.push(
            createViolation({
              file: relativePath,
              line: getNodeLine(sourceFile, element),
              methodName,
              rule: 'adapter-controller-method-inventory',
            })
          );
        }
      }
    }
    if (
      ts.isPropertyAccessExpression(node) &&
      methodNames.has(node.name.text) &&
      isMethodReference(node)
    ) {
      const receiverKind = classifyControllerReceiver(node.expression, state);
      if (receiverKind === 'raw') {
        violations.push(
          createViolation({
            file: relativePath,
            line: getNodeLine(sourceFile, node),
            methodName: node.name.text,
            rule: 'detached-controller-method',
          })
        );
      }
      if (receiverKind === 'adapter' && includeAdapterInventory) {
        violations.push(
          createViolation({
            file: relativePath,
            line: getNodeLine(sourceFile, node),
            methodName: node.name.text,
            rule: 'adapter-controller-method-inventory',
          })
        );
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return violations;
}

export function collectDetachedControllerMethodViolations(
  files,
  { includeAdapterInventory = false, methodNames = collectCanonicalControllerMethodNames() } = {}
) {
  const violations = [];

  scanRepoScopedTypeScriptFiles(files, {
    includeTestLikeFiles: false,
    targetFilePatterns: TARGET_FILE_PATTERNS,
    visitFile: ({ relativePath, sourceFile }) => {
      violations.push(
        ...collectFileDetachedControllerMethodViolations({
          includeAdapterInventory,
          methodNames,
          relativePath,
          sourceFile,
        })
      );
    },
  });

  return violations;
}

export function runDetachedControllerMethodCheck({
  collectFiles = collectCodeFiles,
  files = [],
  includeAdapterInventory = false,
  scope = 'workspace',
} = {}) {
  return runScopedCodeFileCheck({
    collectFiles,
    collectViolations: (targetFiles) =>
      collectDetachedControllerMethodViolations(targetFiles, { includeAdapterInventory }),
    files,
    scope,
  });
}

if (isExecutedAsScript(import.meta.url)) {
  const { explicitFiles, reportOnly, repoWide, scope } = parseScopedReportCliArgs(
    process.argv.slice(2)
  );
  const result = runDetachedControllerMethodCheck({
    files: explicitFiles,
    includeAdapterInventory: reportOnly,
    scope,
  });

  process.exit(
    emitScopedReportCliResult({
      labels: {
        failureHeader: 'Detached controller method violations found:',
        passedRepoWide: 'Detached controller method repo-wide guardrail passed\n',
        passedWorkspace: 'Detached controller method guardrail passed\n',
        reportOnlyHeader: 'Detached controller method report found references:',
        skippedRepoWide: 'Detached controller method repo-wide check skipped: no code files\n',
        skippedWorkspace: 'Detached controller method check skipped: no changed code files\n',
      },
      repoWide,
      reportOnly,
      result,
    })
  );
}
