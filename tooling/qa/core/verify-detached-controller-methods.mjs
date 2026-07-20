import ts from 'typescript';

import { collectCodeFiles, isExecutedAsScript } from './shared.mjs';
import {
  getNodeLine,
  runScopedCodeFileCheck,
  scanRepoScopedTypeScriptFiles,
} from './repo-scoped-typescript-scan.mjs';
import { emitScopedReportCliResult, parseScopedReportCliArgs } from './scoped-report-cli.mjs';
import {
  RAW_CONTROLLER_METHODS,
  TARGET_FILE_PATTERNS,
} from './verify-detached-controller-methods.data.mjs';
import {
  classifyControllerReceiver,
  collectControllerIdentifierState,
  isMethodReference,
} from './verify-detached-controller-methods.helpers.mjs';

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
  relativePath,
  sourceFile,
}) {
  const violations = [];
  const state = collectControllerIdentifierState(sourceFile);

  const visit = (node) => {
    if (
      ts.isPropertyAccessExpression(node) &&
      RAW_CONTROLLER_METHODS.has(node.name.text) &&
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
  { includeAdapterInventory = false } = {}
) {
  const violations = [];

  scanRepoScopedTypeScriptFiles(files, {
    includeTestLikeFiles: false,
    targetFilePatterns: TARGET_FILE_PATTERNS,
    visitFile: ({ relativePath, sourceFile }) => {
      violations.push(
        ...collectFileDetachedControllerMethodViolations({
          includeAdapterInventory,
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
