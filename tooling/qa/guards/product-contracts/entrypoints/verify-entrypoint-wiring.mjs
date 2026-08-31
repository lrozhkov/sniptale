/**
 * Entrypoint wiring guardrail.
 * Keeps runtime/page entrypoints thin by blocking direct browser transport and raw messaging seams.
 */

import fs from 'node:fs';
import ts from 'typescript';

import { collectCodeFiles } from '../../../analysis/repository/shared-files.mjs';
import { isExecutedAsScript, printViolations } from '../../../runtime/process/shared-cli.mjs';
import { toRelativePathForRoot } from '../../../analysis/repository/repo-root-relative-path.mjs';
import { getRuntimeTopology } from '../../architecture/runtime-topology/model.mjs';

const FULL_CLOSURE_FILES = new Set([
  'tooling/qa/guards/product-contracts/entrypoints/verify-entrypoint-wiring.mjs',
  'tooling/qa/guards/product-contracts/entrypoints/verify-entrypoint-wiring.test.ts',
  'tooling/qa/guards/architecture/runtime-topology/model.mjs',
  'tooling/qa/guards/architecture/runtime-topology/runtime-topology.data.json',
]);

function createViolation(rule, file, message, line = undefined) {
  return { rule, file, line, message };
}

function nodeLine(sourceFile, node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

export function collectEntrypointWiringViolations(files) {
  return collectEntrypointWiringViolationsWithOptions(files);
}

export function collectEntrypointWiringViolationsWithOptions(files, { root = null } = {}) {
  const violations = [];

  for (const filePath of files) {
    const relativePath = toRelativePathForRoot(filePath, root);
    if (!isEntrypointFile(relativePath, root)) {
      continue;
    }

    const text = fs.readFileSync(filePath, 'utf8');
    const sourceFile = ts.createSourceFile(relativePath, text, ts.ScriptTarget.Latest, true);
    violations.push(...collectFileViolations(relativePath, sourceFile));
  }

  return violations;
}

function isEntrypointFile(relativePath, root) {
  return getRuntimeTopology(root)
    .flatMap((runtime) => runtime.entrypointFiles ?? [])
    .includes(relativePath);
}

function moduleSpecifierText(node) {
  if (
    (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
    node.moduleSpecifier &&
    ts.isStringLiteral(node.moduleSpecifier)
  ) {
    return node.moduleSpecifier.text;
  }
  if (
    ts.isCallExpression(node) &&
    node.expression.kind === ts.SyntaxKind.ImportKeyword &&
    ts.isStringLiteral(node.arguments[0])
  ) {
    return node.arguments[0].text;
  }
  return null;
}

function expressionRoot(node) {
  let current = node;
  while (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)) {
    current = current.expression;
  }
  return ts.isIdentifier(current) ? current.text : null;
}

function collectFileViolations(relativePath, sourceFile) {
  const violations = [];
  const visit = (node) => {
    if (ts.isCallExpression(node) && expressionRoot(node.expression) === 'chrome') {
      violations.push(
        createViolation(
          'entrypoint-browser-transport',
          relativePath,
          'Move direct browser transport out of entrypoints into a wiring or adapter module.',
          nodeLine(sourceFile, node)
        )
      );
    }
    const moduleSpecifier = moduleSpecifierText(node);
    if (moduleSpecifier?.includes('/contracts/messaging')) {
      violations.push(
        createViolation(
          'entrypoint-message-contracts',
          relativePath,
          'Entrypoints must delegate message parsing to a boundary owner.',
          nodeLine(sourceFile, node)
        )
      );
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  return violations;
}

export function runEntrypointWiringCheck({ files = [], root = null } = {}) {
  const needsFullClosure = files.some((file) =>
    FULL_CLOSURE_FILES.has(toRelativePathForRoot(file, root))
  );
  const targetFiles = files.length > 0 && !needsFullClosure ? files : collectCodeFiles();
  return {
    files: targetFiles.map((file) => toRelativePathForRoot(file, root)),
    violations: collectEntrypointWiringViolationsWithOptions(targetFiles, { root }),
  };
}

if (isExecutedAsScript(import.meta.url)) {
  const result = runEntrypointWiringCheck();

  if (result.violations.length > 0) {
    printViolations('Entrypoint wiring guardrail violations found:', result.violations);
    process.exit(1);
  }

  process.stdout.write('Entrypoint wiring guardrail passed\n');
}
