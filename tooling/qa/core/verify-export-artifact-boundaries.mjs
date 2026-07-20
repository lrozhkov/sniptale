/**
 * Export artifact boundary guardrail.
 * Blocks direct raw-object package/archive builder calls in export-manager production code.
 */

import ts from 'typescript';

import { collectCodeFiles, isExecutedAsScript } from './shared.mjs';
import {
  getNodeLine,
  runScopedCodeFileCheck,
  scanRepoScopedTypeScriptFiles,
} from './repo-scoped-typescript-scan.mjs';
import { emitScopedReportCliResult, parseScopedReportCliArgs } from './scoped-report-cli.mjs';

const EXPORT_MANAGER_PATTERN = /^apps\/extension\/src\/content\/parser\/export-manager\//u;
const BUILDER_NAMES = new Set(['buildExportPagePackage', 'createExportArchiveBlob']);

function getCallName(expression) {
  if (ts.isIdentifier(expression)) {
    return expression.text;
  }

  if (ts.isPropertyAccessExpression(expression)) {
    return expression.name.text;
  }

  return null;
}

function isCreateExportArtifactCall(node) {
  return ts.isCallExpression(node) && getCallName(node.expression) === 'createExportArtifact';
}

function isAllowedExportArtifactArgument(argument) {
  return (
    (ts.isIdentifier(argument) && /artifact|exportArtifact/u.test(argument.text)) ||
    isCreateExportArtifactCall(argument)
  );
}

function isAllowedArchiveArtifactArgument(argument) {
  return (
    (ts.isIdentifier(argument) && /artifact|pagePackage/u.test(argument.text)) ||
    (ts.isPropertyAccessExpression(argument) && argument.name.text === 'pagePackage')
  );
}

function isAllowedBuilderArgument(builderName, argument) {
  if (!argument || ts.isObjectLiteralExpression(argument)) {
    return false;
  }

  if (builderName === 'buildExportPagePackage') {
    return isAllowedExportArtifactArgument(argument);
  }

  return isAllowedArchiveArtifactArgument(argument);
}

function createViolation(file, line, builderName) {
  const artifactName =
    builderName === 'buildExportPagePackage' ? 'ExportArtifact' : 'ArchiveArtifact';

  return {
    rule: 'export-artifact-boundaries',
    file,
    line,
    message: [
      `${builderName} must receive a validated ${artifactName},`,
      'not raw treeData/files/extraAssets/package data.',
    ].join(' '),
  };
}

export function collectExportArtifactBoundaryViolations(files) {
  const violations = [];

  scanRepoScopedTypeScriptFiles(files, {
    targetFilePatterns: [EXPORT_MANAGER_PATTERN],
    visitFile: ({ normalizedPath, sourceFile }) => {
      const visit = (node) => {
        if (ts.isCallExpression(node)) {
          const builderName = getCallName(node.expression);

          if (
            BUILDER_NAMES.has(builderName) &&
            !isAllowedBuilderArgument(builderName, node.arguments[0])
          ) {
            violations.push(
              createViolation(normalizedPath, getNodeLine(sourceFile, node), builderName)
            );
          }
        }

        ts.forEachChild(node, visit);
      };

      visit(sourceFile);
    },
  });

  return violations;
}

export function runExportArtifactBoundaryCheck({ files = [], scope = 'workspace' } = {}) {
  return runScopedCodeFileCheck({
    collectFiles: collectCodeFiles,
    collectViolations: collectExportArtifactBoundaryViolations,
    files,
    scope,
  });
}

if (isExecutedAsScript(import.meta.url)) {
  const { explicitFiles, reportOnly, repoWide, scope } = parseScopedReportCliArgs(
    process.argv.slice(2)
  );
  const result = runExportArtifactBoundaryCheck({
    files: explicitFiles,
    scope,
  });

  process.exit(
    emitScopedReportCliResult({
      labels: {
        skippedRepoWide: 'Export artifact boundary repo-wide check skipped: no code files\n',
        skippedWorkspace: 'Export artifact boundary check skipped: no changed code files\n',
        reportOnlyHeader: 'Export artifact boundary report found violations:',
        failureHeader: 'Export artifact boundary violations found:',
        passedRepoWide: 'Export artifact boundary repo-wide guard passed\n',
        passedWorkspace: 'Export artifact boundary guard passed\n',
      },
      repoWide,
      reportOnly,
      result,
    })
  );
}
