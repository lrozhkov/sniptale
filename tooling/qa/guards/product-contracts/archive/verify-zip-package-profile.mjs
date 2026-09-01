/** Canonical ZIP input-profile ownership guard. */
import ts from 'typescript';
import { collectCodeFiles } from '../../../analysis/repository/shared-files.mjs';
import { isExecutedAsScript } from '../../../runtime/process/shared-cli.mjs';
import {
  emitScopedReportCliResult,
  parseScopedReportCliArgs,
} from '../../../composition/runtime/scoped-report-cli.mjs';
import {
  getNodeLine,
  runScopedCodeFileCheck,
  scanRepoScopedTypeScriptFiles,
} from '../../../analysis/source/repo-scoped-typescript-scan.mjs';

const TARGETS = [/^apps\/extension\/src\/.+\.[cm]?[jt]sx?$/u];
function importBindings(sourceFile) {
  const moduleBindings = new Set();
  const zipBindings = new Set();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier))
      continue;
    if (statement.moduleSpecifier.text === 'jszip' && statement.importClause?.name) {
      zipBindings.add(statement.importClause.name.text);
    }
    if (
      statement.moduleSpecifier.text === 'jszip' &&
      statement.importClause?.namedBindings &&
      ts.isNamespaceImport(statement.importClause.namedBindings)
    ) {
      moduleBindings.add(statement.importClause.namedBindings.name.text);
    }
    if (
      statement.moduleSpecifier.text === 'jszip' &&
      statement.importClause?.namedBindings &&
      ts.isNamedImports(statement.importClause.namedBindings)
    ) {
      for (const element of statement.importClause.namedBindings.elements) {
        if (element.propertyName?.text === 'default') zipBindings.add(element.name.text);
      }
    }
  }
  function visit(node) {
    if (
      ts.isVariableDeclaration(node) &&
      node.initializer &&
      ts.isObjectBindingPattern(node.name) &&
      isDynamicJsZipImport(node.initializer)
    ) {
      for (const element of node.name.elements) {
        if (
          ts.isIdentifier(element.name) &&
          (!element.propertyName ||
            (ts.isIdentifier(element.propertyName) && element.propertyName.text === 'default'))
        ) {
          zipBindings.add(element.name.text);
        }
      }
    }
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      isDynamicJsZipDefault(node.initializer)
    ) {
      zipBindings.add(node.name.text);
    }
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      isDynamicJsZipImport(node.initializer)
    ) {
      moduleBindings.add(node.name.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return { moduleBindings, zipBindings };
}

function unwrapExpression(node) {
  let candidate = node;
  while (ts.isAwaitExpression(candidate) || ts.isParenthesizedExpression(candidate)) {
    candidate = candidate.expression;
  }
  return candidate;
}

function isDynamicJsZipImport(node) {
  const candidate = unwrapExpression(node);
  return (
    ts.isCallExpression(candidate) &&
    candidate.expression.kind === ts.SyntaxKind.ImportKeyword &&
    ts.isStringLiteral(candidate.arguments[0]) &&
    candidate.arguments[0].text === 'jszip'
  );
}

function isDynamicJsZipDefault(node) {
  const candidate = unwrapExpression(node);
  return (
    ts.isPropertyAccessExpression(candidate) &&
    candidate.name.text === 'default' &&
    isDynamicJsZipImport(candidate.expression)
  );
}

function isJsZipLoaderReceiver(node, bindings) {
  const receiver = unwrapExpression(node);
  if (ts.isIdentifier(receiver)) return bindings.zipBindings.has(receiver.text);
  if (!ts.isPropertyAccessExpression(receiver) || receiver.name.text !== 'default') return false;
  const namespace = unwrapExpression(receiver.expression);
  return (
    (ts.isIdentifier(namespace) && bindings.moduleBindings.has(namespace.text)) ||
    isDynamicJsZipImport(namespace)
  );
}

function collectCalls(sourceFile, bindings) {
  const loadCalls = [];
  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      if (
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === 'loadAsync' &&
        isJsZipLoaderReceiver(node.expression.expression, bindings)
      )
        loadCalls.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return { loadCalls };
}

export function collectZipPackageProfileViolations(files) {
  const violations = [];
  scanRepoScopedTypeScriptFiles(files, {
    includeTestLikeFiles: false,
    targetFilePatterns: TARGETS,
    visitFile: ({ normalizedPath, sourceFile }) => {
      const bindings = importBindings(sourceFile);
      const calls = collectCalls(sourceFile, bindings);
      for (const call of calls.loadCalls)
        violations.push({
          rule: 'zip-input-profile-ownership',
          file: normalizedPath,
          line: getNodeLine(sourceFile, call),
          message:
            'Raw JSZip input loading is forbidden outside the canonical verified-loader owner.',
        });
    },
  });
  return violations;
}

export function runZipPackageProfileCheck({ files = [], scope = 'workspace' } = {}) {
  return runScopedCodeFileCheck({
    collectFiles: collectCodeFiles,
    collectViolations: collectZipPackageProfileViolations,
    files,
    scope,
  });
}

if (isExecutedAsScript(import.meta.url)) {
  const { explicitFiles, reportOnly, repoWide, scope } = parseScopedReportCliArgs(
    process.argv.slice(2)
  );
  const result = runZipPackageProfileCheck({ files: explicitFiles, scope });
  process.exit(
    emitScopedReportCliResult({
      labels: {
        skippedRepoWide: 'ZIP input-profile repo-wide check skipped: no code files\n',
        skippedWorkspace: 'ZIP input-profile check skipped: no changed code files\n',
        reportOnlyHeader: 'ZIP input-profile report found violations:',
        failureHeader: 'ZIP input-profile violations found:',
        passedRepoWide: 'ZIP input-profile repo-wide guard passed\n',
        passedWorkspace: 'ZIP input-profile guard passed\n',
      },
      repoWide,
      reportOnly,
      result,
    })
  );
}
