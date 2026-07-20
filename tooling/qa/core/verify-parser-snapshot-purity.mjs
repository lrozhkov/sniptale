/**
 * Parser snapshot purity guardrail.
 * Blocks parser/export seams from reaching back into live DOM/window globals instead of snapshot/IR data.
 */

import ts from 'typescript';

import {
  collectCodeFiles,
  isExecutedAsScript,
  parseFilesArgument,
  printViolations,
} from './shared.mjs';
import { getNodeLine, scanRepoScopedTypeScriptFiles } from './repo-scoped-typescript-scan.mjs';
import { resolveScopedTargetFiles } from '../runtime/target-files.helpers.mjs';

const TARGET_FILE_PATTERNS = [
  /^apps\/extension\/src\/content\/parser\/pipelines\/.+\.[cm]?[jt]sx?$/u,
  /^apps\/extension\/src\/content\/parser\/export-manager.+\.[cm]?[jt]sx?$/u,
];
const ALLOWLISTED_BOUNDARY_OWNERS = new Set([
  'apps/extension/src/content/parser/export-manager-dom-driver.ts',
  'apps/extension/src/content/parser/export-manager/diagnostics/dom-driver.ts',
  'apps/extension/src/content/parser/export-manager/file-modal-utils.ts',
]);
const ALLOWED_WINDOW_PROPERTY_NAMES = new Set(['setTimeout', 'clearTimeout']);
const DISALLOWED_DOCUMENT_PROPERTY_NAMES = new Set([
  'querySelector',
  'querySelectorAll',
  'getElementById',
  'title',
  'body',
  'documentElement',
]);
const DISALLOWED_WINDOW_PROPERTY_NAMES = new Set(['location']);
const DISALLOWED_LOCATION_PROPERTY_NAMES = new Set(['href', 'pathname', 'hostname', 'origin']);

function createViolation(file, message, line) {
  return {
    rule: 'parser-snapshot-purity',
    file,
    line,
    message,
  };
}

function collectPropertyAccessViolations(relativePath, sourceFile, node) {
  if (!ts.isPropertyAccessExpression(node) || !ts.isIdentifier(node.expression)) {
    return [];
  }

  if (
    node.expression.text === 'document' &&
    DISALLOWED_DOCUMENT_PROPERTY_NAMES.has(node.name.text)
  ) {
    return [
      createViolation(
        relativePath,
        'Parser/export seams must use snapshot or IR data instead of direct document access.',
        getNodeLine(sourceFile, node)
      ),
    ];
  }

  if (
    node.expression.text === 'window' &&
    DISALLOWED_WINDOW_PROPERTY_NAMES.has(node.name.text) &&
    !ALLOWED_WINDOW_PROPERTY_NAMES.has(node.name.text)
  ) {
    return [
      createViolation(
        relativePath,
        'Parser/export seams must not depend on live window.location outside boundary owners.',
        getNodeLine(sourceFile, node)
      ),
    ];
  }

  if (
    node.expression.text === 'location' &&
    DISALLOWED_LOCATION_PROPERTY_NAMES.has(node.name.text)
  ) {
    return [
      createViolation(
        relativePath,
        'Parser/export seams must not read live location.* directly; prefer snapshot/page profile data.',
        getNodeLine(sourceFile, node)
      ),
    ];
  }

  return [];
}

export function collectParserSnapshotPurityViolations(files) {
  const violations = [];

  scanRepoScopedTypeScriptFiles(files, {
    allowlistedRelativePaths: ALLOWLISTED_BOUNDARY_OWNERS,
    targetFilePatterns: TARGET_FILE_PATTERNS,
    visitFile: ({ relativePath, sourceFile }) => {
      const visit = (node) => {
        violations.push(...collectPropertyAccessViolations(relativePath, sourceFile, node));

        ts.forEachChild(node, visit);
      };

      visit(sourceFile);
    },
  });

  return violations;
}

export function runParserSnapshotPurityCheck({ files = [] } = {}) {
  const targets = resolveScopedTargetFiles({
    files,
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
  const result = runParserSnapshotPurityCheck({ files: explicitFiles });

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
