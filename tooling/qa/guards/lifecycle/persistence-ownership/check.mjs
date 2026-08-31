/** Persistence entrypoint and mutation ownership guard. */

import ts from 'typescript';

import { collectCodeFiles } from '../../../analysis/repository/shared-files.mjs';
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
import { createViolation } from '../../audit/execution/shared.mjs';
import { isPersistenceAuthorityOwner } from '../../audit/storage/owners.mjs';

const SOURCE_PATTERNS = [/^(?:apps\/extension\/src|packages\/[^/]+\/src)\//u];
const STORAGE_AUTHORITY_OWNERS = [
  /^packages\/platform\/src\/browser\/content-runtime-shim\.ts$/u,
  /^apps\/extension\/src\/composition\/persistence\/infrastructure\/browser-storage\/(?:area-adapter|index)\.ts$/u,
  /^apps\/extension\/src\/composition\/persistence\/infrastructure\/mutation-barrier\.ts$/u,
  /^apps\/extension\/src\/composition\/persistence\/state-manager\//u,
];
const SINGLETON_IMPORT_OWNERS = [
  /^apps\/extension\/src\/composition\/persistence\/state-manager\//u,
  /^apps\/extension\/src\/composition\/persistence\/infrastructure\/browser-storage\/(?:area-adapter|index)\.ts$/u,
  /^apps\/extension\/src\/composition\/persistence\/infrastructure\/indexed-db\/core\.ts$/u,
  /^apps\/extension\/src\/background\/routing-contracts\/capabilities\/privileged-authority\/state\.ts$/u,
  /^apps\/extension\/src\/background\/capture\/jobs\/default-service\.ts$/u,
];
function createOwnershipViolation(rule, file, sourceFile, node, message) {
  return createViolation(rule, file, getNodeLine(sourceFile, node), message);
}

function matchesOwner(file, patterns) {
  return patterns.some((pattern) => pattern.test(file));
}

function isChromeStorageAccess(node) {
  return (
    ts.isPropertyAccessExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === 'chrome' &&
    node.name.text === 'storage'
  );
}

function isStateManagerModule(specifier) {
  return /(?:^|\/)state-manager(?:\/index|\/default-state-manager)?$/u.test(specifier);
}

function isSingletonBinding(elements) {
  return elements.some(
    (element) => (element.propertyName?.text ?? element.name.text) === 'stateManager'
  );
}

function isStateManagerSingletonBoundary(node) {
  if (
    ts.isImportDeclaration(node) &&
    ts.isStringLiteral(node.moduleSpecifier) &&
    isStateManagerModule(node.moduleSpecifier.text)
  ) {
    const bindings = node.importClause?.namedBindings;
    return Boolean(
      bindings && ts.isNamedImports(bindings) && isSingletonBinding(bindings.elements)
    );
  }
  return Boolean(
    ts.isExportDeclaration(node) &&
    node.exportClause &&
    ts.isNamedExports(node.exportClause) &&
    node.moduleSpecifier &&
    ts.isStringLiteral(node.moduleSpecifier) &&
    isStateManagerModule(node.moduleSpecifier.text) &&
    isSingletonBinding(node.exportClause.elements)
  );
}

function isIndexedDbEntrypoint(node) {
  if (
    ts.isImportDeclaration(node) &&
    ts.isStringLiteral(node.moduleSpecifier) &&
    node.moduleSpecifier.text === 'idb'
  ) {
    return true;
  }
  return (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    ts.isIdentifier(node.expression.expression) &&
    node.expression.expression.text === 'indexedDB'
  );
}

export function collectPersistenceOwnershipViolations(files) {
  const violations = [];
  scanRepoScopedTypeScriptFiles(files, {
    includeTestLikeFiles: false,
    targetFilePatterns: SOURCE_PATTERNS,
    visitFile: ({ normalizedPath, sourceFile }) => {
      const visit = (node) => {
        if (
          !matchesOwner(normalizedPath, STORAGE_AUTHORITY_OWNERS) &&
          isChromeStorageAccess(node)
        ) {
          violations.push(
            createOwnershipViolation(
              'storage-entrypoint-owner-bypass',
              normalizedPath,
              sourceFile,
              node,
              'Chrome storage entrypoints must stay behind the browser-storage authority.'
            )
          );
          return;
        }
        if (
          !matchesOwner(normalizedPath, SINGLETON_IMPORT_OWNERS) &&
          isStateManagerSingletonBoundary(node)
        ) {
          violations.push(
            createOwnershipViolation(
              'state-manager-singleton-owner-bypass',
              normalizedPath,
              sourceFile,
              node,
              'Business code must receive persistence dependencies instead of importing the singleton.'
            )
          );
          return;
        }
        if (!isPersistenceAuthorityOwner(normalizedPath) && isIndexedDbEntrypoint(node)) {
          violations.push(
            createOwnershipViolation(
              'indexed-db-entrypoint-owner-bypass',
              normalizedPath,
              sourceFile,
              node,
              'IndexedDB entrypoints must stay behind an explicit persistence authority.'
            )
          );
          return;
        }
        ts.forEachChild(node, visit);
      };
      ts.forEachChild(sourceFile, visit);
    },
  });
  return violations;
}

export function runPersistenceOwnershipCheck({ files = [], scope = 'workspace' } = {}) {
  return runScopedCodeFileCheck({
    collectFiles: collectCodeFiles,
    collectViolations: collectPersistenceOwnershipViolations,
    files,
    scope,
  });
}

if (isExecutedAsScript(import.meta.url)) {
  const { explicitFiles, reportOnly, repoWide, scope } = parseScopedReportCliArgs(
    process.argv.slice(2)
  );
  const result = runPersistenceOwnershipCheck({ files: explicitFiles, scope });
  process.exit(
    emitScopedReportCliResult({
      labels: {
        skippedRepoWide: 'Persistence ownership repo-wide check skipped: no code files\n',
        skippedWorkspace: 'Persistence ownership check skipped: no changed code files\n',
        reportOnlyHeader: 'Persistence ownership report found violations:',
        failureHeader: 'Persistence ownership violations found:',
        passedRepoWide: 'Persistence ownership repo-wide guard passed\n',
        passedWorkspace: 'Persistence ownership guard passed\n',
      },
      repoWide,
      reportOnly,
      result,
    })
  );
}
