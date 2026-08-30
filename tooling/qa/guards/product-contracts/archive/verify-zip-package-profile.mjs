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
const PROFILE_MODULE = '@sniptale/platform/data/zip-profile';

function importBindings(sourceFile) {
  const zipBindings = new Set();
  const profileBindings = new Set();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier))
      continue;
    if (statement.moduleSpecifier.text === 'jszip' && statement.importClause?.name) {
      zipBindings.add(statement.importClause.name.text);
    }
    if (statement.moduleSpecifier.text !== PROFILE_MODULE) continue;
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const element of bindings.elements) {
      if (
        (element.propertyName?.text ?? element.name.text) === 'assertZipPackageInflationProfile'
      ) {
        profileBindings.add(element.name.text);
      }
    }
  }
  return { profileBindings, zipBindings };
}

function collectCalls(sourceFile, bindings) {
  const loadCalls = [];
  let profileCalled = false;
  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      if (
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === 'loadAsync' &&
        ts.isIdentifier(node.expression.expression) &&
        bindings.zipBindings.has(node.expression.expression.text)
      )
        loadCalls.push(node);
      if (ts.isIdentifier(node.expression) && bindings.profileBindings.has(node.expression.text))
        profileCalled = true;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return { loadCalls, profileCalled };
}

export function collectZipPackageProfileViolations(files) {
  const violations = [];
  scanRepoScopedTypeScriptFiles(files, {
    includeTestLikeFiles: false,
    targetFilePatterns: TARGETS,
    visitFile: ({ normalizedPath, sourceFile }) => {
      const calls = collectCalls(sourceFile, importBindings(sourceFile));
      if (calls.loadCalls.length === 0 || calls.profileCalled) return;
      for (const call of calls.loadCalls)
        violations.push({
          rule: 'zip-input-profile-ownership',
          file: normalizedPath,
          line: getNodeLine(sourceFile, call),
          message:
            'JSZip input loading must invoke the canonical platform inflation-profile owner.',
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
