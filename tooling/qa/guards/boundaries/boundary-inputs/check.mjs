/**
 * Boundary input guardrail.
 * Inventories runtime and Port listener seams and keeps their payloads unknown until local proof.
 */

import path from 'node:path';
import ts from 'typescript';

import { getSourceSnapshot } from '../../../analysis/source/source-snapshot.mjs';
import {
  getFunctionLikeName,
  getNodeLine,
  getPropertyAccessChain,
} from '../../../analysis/source/typescript-ast-helpers.mjs';
import { collectCodeFiles } from '../../../analysis/repository/shared-files.mjs';
import { toRelativePath } from '../../../analysis/repository/shared-paths.mjs';
import { isExecutedAsScript, printViolations } from '../../../runtime/process/shared-cli.mjs';
import { resolveScopedTargetFiles } from '../../../runtime/scope/target-files.helpers.mjs';
import { isProductionCodeFile } from '../../audit/execution/shared.mjs';

const RUNTIME_MODULE = '@sniptale/platform/browser/runtime';
const VALIDATOR_NAME_PATTERN = /^(?:assert|has|is|narrow|parse|validate)[A-Z_]/u;

function createViolation(rule, file, message, node, sourceFile) {
  return { rule, file, line: getNodeLine(sourceFile, node), message };
}

function collectLocalBindings(sourceFile) {
  const bindings = new Map();
  const visit = (node) => {
    if (ts.isFunctionDeclaration(node) && node.name) bindings.set(node.name.text, node);
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      bindings.set(node.name.text, node.initializer);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return bindings;
}

function collectImportBindings(sourceFile) {
  const bindings = new Map();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
      continue;
    }
    for (const element of statement.importClause?.namedBindings?.elements ?? []) {
      bindings.set(element.name.text, {
        importedName: (element.propertyName ?? element.name).text,
        moduleSpecifier: statement.moduleSpecifier.text,
      });
    }
  }
  return bindings;
}

function collectRuntimeBindings(sourceFile) {
  const bindings = new Set();
  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== RUNTIME_MODULE
    ) {
      continue;
    }
    for (const element of statement.importClause?.namedBindings?.elements ?? []) {
      if ((element.propertyName ?? element.name).text === 'browserRuntime') {
        bindings.add(element.name.text);
      }
    }
  }
  return bindings;
}

function resolveImportContext(context, imported, contexts) {
  if (!imported.moduleSpecifier.startsWith('.')) return null;
  const base = path.resolve(path.dirname(context.filePath), imported.moduleSpecifier);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.mjs`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
    path.join(base, 'index.js'),
    path.join(base, 'index.mjs'),
  ];
  return candidates.map((candidate) => contexts.get(candidate)).find(Boolean) ?? null;
}

function resolveBoundNode(identifier, context, contexts, visited) {
  const visitKey = `${context.filePath}:${identifier.text}`;
  if (visited.has(visitKey)) return null;
  visited.add(visitKey);
  const local = context.localBindings.get(identifier.text);
  if (local) return { context, node: local };
  const imported = context.importBindings.get(identifier.text);
  const importedContext = imported ? resolveImportContext(context, imported, contexts) : null;
  if (!importedContext) return null;
  const importedNode = importedContext.localBindings.get(imported.importedName);
  return importedNode ? { context: importedContext, node: importedNode } : null;
}

function getCallbackNode(argument, context, contexts, visited = new Set()) {
  if (ts.isArrowFunction(argument) || ts.isFunctionExpression(argument)) return argument;
  if (ts.isIdentifier(argument)) {
    const resolved = resolveBoundNode(argument, context, contexts, visited);
    return resolved ? getCallbackNode(resolved.node, resolved.context, contexts, visited) : null;
  }
  if (ts.isFunctionDeclaration(argument)) return argument;
  if (!ts.isCallExpression(argument) || !ts.isIdentifier(argument.expression)) return null;
  const resolved = resolveBoundNode(argument.expression, context, contexts, visited);
  const factory = resolved?.node;
  if (!factory || !ts.isFunctionLike(factory) || !ts.isBlock(factory.body)) return null;
  for (const statement of factory.body.statements) {
    if (!ts.isReturnStatement(statement) || !statement.expression) continue;
    if (ts.isArrowFunction(statement.expression) || ts.isFunctionExpression(statement.expression)) {
      return statement.expression;
    }
    if (ts.isIdentifier(statement.expression)) {
      return getCallbackNode(statement.expression, resolved.context, contexts, visited);
    }
  }
  return null;
}

function isRuntimeSubscription(node, runtimeBindings, method) {
  if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return false;
  return (
    node.expression.name.text === method &&
    ts.isIdentifier(node.expression.expression) &&
    runtimeBindings.has(node.expression.expression.text)
  );
}

function isRawRuntimeSubscription(node) {
  if (!ts.isCallExpression(node)) return false;
  const chain = getPropertyAccessChain(node.expression);
  if (!chain || chain.at(-1) !== 'addListener') return false;
  const prefix = chain.slice(0, -1).join('.');
  return prefix === 'chrome.runtime.onMessage' || prefix === 'chrome.runtime.onConnect';
}

function isPortMessageSubscription(node) {
  if (!ts.isCallExpression(node)) return false;
  const chain = getPropertyAccessChain(node.expression);
  return Boolean(
    chain && chain.length >= 3 && chain.at(-2) === 'onMessage' && chain.at(-1) === 'addListener'
  );
}

function classifyBoundaryCall(node, runtimeBindings) {
  if (isRuntimeSubscription(node, runtimeBindings, 'subscribeToMessages')) return 'runtime-message';
  if (isRuntimeSubscription(node, runtimeBindings, 'subscribeToConnections'))
    return 'runtime-connection';
  if (isRawRuntimeSubscription(node)) {
    const chain = getPropertyAccessChain(node.expression);
    return chain?.includes('onConnect') ? 'runtime-connection' : 'runtime-message';
  }
  if (isPortMessageSubscription(node)) return 'port-message';
  return null;
}

function getCalleeName(expression) {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  return null;
}

function rootForExpression(expression, roots) {
  let current = expression;
  while (ts.isParenthesizedExpression(current) || ts.isNonNullExpression(current)) {
    current = current.expression;
  }
  return ts.isIdentifier(current) ? (roots.get(current.text) ?? null) : null;
}

function validatorRoot(call, roots) {
  const name = getCalleeName(call.expression);
  if (!name || !VALIDATOR_NAME_PATTERN.test(name)) return null;
  for (const argument of call.arguments) {
    const root = rootForExpression(argument, roots);
    if (root) return root;
  }
  return null;
}

function conditionValidatorRoot(condition, roots) {
  let expression = condition;
  while (ts.isParenthesizedExpression(expression) || ts.isPrefixUnaryExpression(expression)) {
    expression = expression.operand;
  }
  return ts.isCallExpression(expression) ? validatorRoot(expression, roots) : null;
}

function statementExits(statement) {
  if (ts.isReturnStatement(statement) || ts.isThrowStatement(statement)) return true;
  if (!ts.isBlock(statement) || statement.statements.length === 0) return false;
  return statementExits(statement.statements.at(-1));
}

function conditionRejectsValidatedValue(condition, thenStatement, root, roots) {
  let expression = condition;
  let negated = false;
  while (ts.isParenthesizedExpression(expression)) expression = expression.expression;
  if (
    ts.isPrefixUnaryExpression(expression) &&
    expression.operator === ts.SyntaxKind.ExclamationToken
  ) {
    negated = true;
    expression = expression.operand;
  }
  return (
    negated &&
    ts.isCallExpression(expression) &&
    validatorRoot(expression, roots) === root &&
    statementExits(thenStatement)
  );
}

function inspectExpression(node, state) {
  if (
    (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) &&
    rootForExpression(node.expression, state.roots)
  ) {
    state.hasUnvalidatedRead = true;
  }
  if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
    const root = rootForExpression(node.expression, state.roots);
    if (root && !state.validatedRoots.has(root)) state.hasUnvalidatedRead = true;
  }
  if (ts.isCallExpression(node) && validatorRoot(node, state.roots)) return;
  ts.forEachChild(node, (child) => inspectExpression(child, state));
}

function inspectStatement(statement, state) {
  if (ts.isVariableStatement(statement)) {
    for (const declaration of statement.declarationList.declarations) {
      if (!declaration.initializer) continue;
      inspectExpression(declaration.initializer, state);
      if (ts.isIdentifier(declaration.name)) {
        const root = rootForExpression(declaration.initializer, state.roots);
        if (root) state.roots.set(declaration.name.text, root);
      }
    }
    return;
  }
  if (ts.isIfStatement(statement)) {
    inspectExpression(statement.expression, state);
    const root = conditionValidatorRoot(statement.expression, state.roots);
    const thenState = {
      ...state,
      validatedRoots: new Set(state.validatedRoots),
    };
    if (
      root &&
      !conditionRejectsValidatedValue(
        statement.expression,
        statement.thenStatement,
        root,
        state.roots
      )
    ) {
      thenState.validatedRoots.add(root);
    }
    inspectStatement(statement.thenStatement, thenState);
    state.hasUnvalidatedRead ||= thenState.hasUnvalidatedRead;
    if (statement.elseStatement) inspectStatement(statement.elseStatement, state);
    if (
      root &&
      conditionRejectsValidatedValue(
        statement.expression,
        statement.thenStatement,
        root,
        state.roots
      )
    ) {
      state.validatedRoots.add(root);
    }
    return;
  }
  if (ts.isBlock(statement)) {
    for (const child of statement.statements) inspectStatement(child, state);
    return;
  }
  inspectExpression(statement, state);
}

function analyzeBoundaryCallback(file, sourceFile, callbackNode) {
  const firstParam = callbackNode.parameters[0];
  if (!firstParam || !ts.isIdentifier(firstParam.name)) return [];
  const paramName = firstParam.name.text;
  const paramType = firstParam.type?.getText(sourceFile).replace(/\s+/gu, ' ');
  const violations = [];
  if (paramType && paramType !== 'unknown') {
    violations.push(
      createViolation(
        'boundary-input-non-unknown',
        file,
        `Boundary listener input "${paramName}" must be typed as unknown before local validation.`,
        firstParam,
        sourceFile
      )
    );
  }
  const state = {
    hasUnvalidatedRead: false,
    roots: new Map([[paramName, paramName]]),
    validatedRoots: new Set(),
  };
  if (ts.isBlock(callbackNode.body)) {
    for (const statement of callbackNode.body.statements) inspectStatement(statement, state);
  } else {
    inspectExpression(callbackNode.body, state);
  }
  const callbackName = getFunctionLikeName(callbackNode);
  const nameSuffix = callbackName ? ` "${callbackName}"` : '';
  if (state.hasUnvalidatedRead) {
    violations.push(
      createViolation(
        'boundary-input-unvalidated',
        file,
        `Boundary listener${nameSuffix} reads external input "${paramName}" before local validation.`,
        callbackNode,
        sourceFile
      )
    );
  }
  return violations;
}

export function inspectBoundaryInputFiles(files) {
  const inventory = [];
  const violations = [];
  const contexts = new Map();
  for (const filePath of files) {
    const absolutePath = path.resolve(filePath);
    const sourceFile = getSourceSnapshot({ filePath: absolutePath }).sourceFile;
    contexts.set(absolutePath, {
      filePath: absolutePath,
      importBindings: collectImportBindings(sourceFile),
      localBindings: collectLocalBindings(sourceFile),
      sourceFile,
    });
  }
  for (const context of contexts.values()) {
    const file = toRelativePath(context.filePath);
    const isExternalFixture = file.startsWith('../');
    const isProductSource = /^(?:apps\/extension\/src|packages)\//u.test(file);
    if (!isProductionCodeFile(file) || (!isExternalFixture && !isProductSource)) {
      continue;
    }
    const { sourceFile } = context;
    const runtimeBindings = collectRuntimeBindings(sourceFile);
    const visit = (node) => {
      const kind = classifyBoundaryCall(node, runtimeBindings);
      if (kind) {
        const callback =
          node.arguments.length > 0 ? getCallbackNode(node.arguments[0], context, contexts) : null;
        inventory.push({
          callbackResolved: Boolean(callback),
          file,
          kind,
          line: getNodeLine(sourceFile, node),
        });
        if (callback && kind !== 'runtime-connection') {
          const callbackSourceFile = callback.getSourceFile();
          violations.push(
            ...analyzeBoundaryCallback(
              toRelativePath(callbackSourceFile.fileName),
              callbackSourceFile,
              callback
            )
          );
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  return { inventory, violations };
}

export function runBoundaryInputCheck({ files = [], scope = 'workspace' } = {}) {
  const targets = resolveScopedTargetFiles({
    files,
    scope,
    collectFiles: collectCodeFiles,
  });
  const result = inspectBoundaryInputFiles(targets.files);
  return { ...result, skipped: targets.skipped, files: targets.relativeFiles };
}

if (isExecutedAsScript(import.meta.url)) {
  const result = runBoundaryInputCheck({ scope: 'repo-wide' });
  if (result.violations.length > 0) {
    printViolations('Boundary input guardrail violations found:', result.violations);
    process.exit(1);
  }
  process.stdout.write(`Boundary input guardrail passed (${result.inventory.length} listeners)\n`);
}
