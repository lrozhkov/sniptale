/**
 * Storage write-pattern guardrail.
 * Blocks risky whole-object overwrite writes in storage/persistence helpers.
 */

import ts from 'typescript';

import { collectCodeFiles, isExecutedAsScript } from './shared.mjs';
import {
  getNodeLine,
  runScopedCodeFileCheck,
  scanRepoScopedTypeScriptFiles,
} from './repo-scoped-typescript-scan.mjs';
import { emitScopedReportCliResult, parseScopedReportCliArgs } from './scoped-report-cli.mjs';
import { collectHotPathCleanupViolations } from './verify-storage-write-patterns.helpers.mjs';
import {
  collectPersistenceAuthorityViolations,
  collectStateManagerAuthorityViolations,
  collectStateManagerDefaultImportViolations,
  collectStorageMutationOwnershipViolations,
} from './audit-guardrail-core.mjs';
import { STORAGE_WRITE_PATTERN_TRIGGER_PATTERNS } from './verify-focused.config.mjs';
const WRITE_METHOD_NAMES = new Set(['set', 'put']);
const SPREAD_SOURCE_NAMES = new Set([
  'current',
  'entry',
  'existing',
  'nextState',
  'payload',
  'preferences',
  'result',
  'settings',
  'snapshot',
  'state',
  'stored',
  'sync',
]);

function createWholeObjectViolation(file, line) {
  return {
    rule: 'storage-write-patterns',
    file,
    line,
    message: [
      'Whole-object overwrite pattern detected.',
      'Prefer field-level updates or a dedicated merge contract instead of',
      'spreading existing state into persistence writes.',
    ].join(' '),
  };
}

function hasRiskySpread(property) {
  if (!ts.isSpreadAssignment(property)) {
    return false;
  }

  if (ts.isIdentifier(property.expression)) {
    return SPREAD_SOURCE_NAMES.has(property.expression.text);
  }

  if (ts.isPropertyAccessExpression(property.expression)) {
    return SPREAD_SOURCE_NAMES.has(property.expression.name.text);
  }

  return false;
}

export function collectWholeObjectOverwriteViolations(files) {
  const violations = [];

  scanRepoScopedTypeScriptFiles(files, {
    targetFilePatterns: STORAGE_WRITE_PATTERN_TRIGGER_PATTERNS,
    visitFile: ({ normalizedPath, sourceFile }) => {
      const visit = (node) => {
        if (
          ts.isCallExpression(node) &&
          ts.isPropertyAccessExpression(node.expression) &&
          WRITE_METHOD_NAMES.has(node.expression.name.text)
        ) {
          const firstArgument = node.arguments[0];
          if (firstArgument && ts.isObjectLiteralExpression(firstArgument)) {
            const hasSpreadOverwrite = firstArgument.properties.some((property) =>
              hasRiskySpread(property)
            );

            if (hasSpreadOverwrite) {
              violations.push(
                createWholeObjectViolation(normalizedPath, getNodeLine(sourceFile, node))
              );
            }
          }
        }

        ts.forEachChild(node, visit);
      };

      visit(sourceFile);
    },
  });

  return violations;
}

export function collectStorageWritePatternViolations(files) {
  return [
    ...collectWholeObjectOverwriteViolations(files),
    ...collectHotPathCleanupViolations(files),
    ...collectStorageMutationOwnershipViolations(files),
    ...collectPersistenceAuthorityViolations(files),
    ...collectStateManagerAuthorityViolations(files),
    ...collectStateManagerDefaultImportViolations(files),
  ];
}

export function runStorageWritePatternCheck({ files = [], scope = 'workspace' } = {}) {
  return runScopedCodeFileCheck({
    collectFiles: collectCodeFiles,
    collectViolations: collectStorageWritePatternViolations,
    files,
    scope,
  });
}

if (isExecutedAsScript(import.meta.url)) {
  const { explicitFiles, reportOnly, repoWide, scope } = parseScopedReportCliArgs(
    process.argv.slice(2)
  );
  const result = runStorageWritePatternCheck({
    files: explicitFiles,
    scope,
  });
  process.exit(
    emitScopedReportCliResult({
      labels: {
        skippedRepoWide: 'Storage write-pattern repo-wide check skipped: no code files\n',
        skippedWorkspace: 'Storage write-pattern check skipped: no changed code files\n',
        reportOnlyHeader: 'Storage write-pattern report found violations:',
        failureHeader: 'Storage write-pattern violations found:',
        passedRepoWide: 'Storage write-pattern repo-wide guard passed\n',
        passedWorkspace: 'Storage write-pattern guard passed\n',
      },
      repoWide,
      reportOnly,
      result,
    })
  );
}
