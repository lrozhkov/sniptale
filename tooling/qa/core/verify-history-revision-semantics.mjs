/**
 * History revision semantics guardrail.
 * Blocks timestamp-as-revision patterns inside history/undo/redo ownership seams.
 */

import ts from 'typescript';

import {
  collectCodeFiles,
  isExecutedAsScript,
  parseFilesArgument,
  printViolations,
} from './shared.mjs';
import {
  getNodeLine,
  runScopedCodeFileCheck,
  scanRepoScopedTypeScriptFiles,
} from './repo-scoped-typescript-scan.mjs';

const TARGET_FILE_PATTERNS = [
  /^apps\/extension\/src\/scenario-editor\/.+history.*\.[cm]?[jt]sx?$/u,
  /^apps\/extension\/src\/editor\/.+history.*\.[cm]?[jt]sx?$/u,
  /^apps\/extension\/src\/video-editor\/.+history.*\.[cm]?[jt]sx?$/u,
];

function createViolation(file, line) {
  return {
    rule: 'history-revision-semantics',
    file,
    line,
    message: [
      'History/revision seams must not use Date.now() as revision identity.',
      'Use an explicit revision counter or dedicated history token.',
    ].join(' '),
  };
}

export function collectHistoryRevisionSemanticsViolations(files) {
  const violations = [];

  scanRepoScopedTypeScriptFiles(files, {
    targetFilePatterns: TARGET_FILE_PATTERNS,
    visitFile: ({ relativePath, sourceFile }) => {
      const visit = (node) => {
        if (
          ts.isCallExpression(node) &&
          ts.isPropertyAccessExpression(node.expression) &&
          ts.isIdentifier(node.expression.expression) &&
          node.expression.expression.text === 'Date' &&
          node.expression.name.text === 'now'
        ) {
          violations.push(createViolation(relativePath, getNodeLine(sourceFile, node)));
        }

        ts.forEachChild(node, visit);
      };

      visit(sourceFile);
    },
  });

  return violations;
}

export function runHistoryRevisionSemanticsCheck({ files = [] } = {}) {
  return runScopedCodeFileCheck({
    collectFiles: collectCodeFiles,
    collectViolations: collectHistoryRevisionSemanticsViolations,
    files,
  });
}

if (isExecutedAsScript(import.meta.url)) {
  const explicitFiles = parseFilesArgument(process.argv.slice(2));
  const result = runHistoryRevisionSemanticsCheck({ files: explicitFiles });

  if (result.skipped) {
    process.stdout.write('History revision semantics check skipped: no changed code files\n');
    process.exit(0);
  }

  if (result.violations.length > 0) {
    printViolations('History revision semantics violations found:', result.violations);
    process.exit(1);
  }

  process.stdout.write('History revision semantics guardrail passed\n');
}
