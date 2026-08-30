/** Enforces the sole direct innerHTML sink and its sanitizer provenance. */

import ts from 'typescript';

import { collectCodeFiles } from '../../../analysis/repository/shared-files.mjs';
import { matchesAny, readText } from '../../../analysis/repository/shared-paths.mjs';
import { getParseableSourceSnapshot } from '../../../analysis/source/source-snapshot.mjs';
import { SECURITY_IGNORE_PATTERNS } from '../../../policy/quality/quality.config.mjs';
import {
  isExecutedAsScript,
  parseFilesArgument,
  printViolations,
} from '../../../runtime/process/shared-cli.mjs';

const CANONICAL_OWNER = 'packages/platform/src/security/sanitizers/html.ts';

function innerHtmlAssignment(node) {
  if (!ts.isBinaryExpression(node) || node.operatorToken.kind !== ts.SyntaxKind.EqualsToken) {
    return false;
  }
  if (ts.isPropertyAccessExpression(node.left)) return node.left.name.text === 'innerHTML';
  return (
    ts.isElementAccessExpression(node.left) &&
    ts.isStringLiteralLike(node.left.argumentExpression) &&
    node.left.argumentExpression.text === 'innerHTML'
  );
}

function callName(expression) {
  return ts.isIdentifier(expression) ? expression.text : null;
}

function sanitizedIdentifiers(sourceFile) {
  const identifiers = new Set();
  let changed = true;
  while (changed) {
    changed = false;
    const visit = (node) => {
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer &&
        ((ts.isCallExpression(node.initializer) &&
          callName(node.initializer.expression) === 'sanitizeHtmlFragment') ||
          (ts.isIdentifier(node.initializer) && identifiers.has(node.initializer.text))) &&
        !identifiers.has(node.name.text)
      ) {
        identifiers.add(node.name.text);
        changed = true;
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  return identifiers;
}

function hasCanonicalSanitizer(sourceFile) {
  return sourceFile.statements.some(
    (statement) =>
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === 'sanitizeHtmlFragment' &&
      statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
  );
}

function sanitizedRightHandSide(expression, identifiers) {
  if (ts.isIdentifier(expression)) return identifiers.has(expression.text);
  return (
    ts.isCallExpression(expression) && callName(expression.expression) === 'sanitizeHtmlFragment'
  );
}

export function collectHtmlSanitizerOwnershipViolations(
  relativePaths,
  { readSource = readText } = {}
) {
  const files = relativePaths.filter(
    (file) =>
      /\.(?:ts|tsx|js|mjs|cjs)$/u.test(file) &&
      !/\.(?:test|spec)\./u.test(file) &&
      !matchesAny(file, SECURITY_IGNORE_PATTERNS)
  );
  const violations = [];
  for (const file of files) {
    const source = readSource(file);
    const sourceFile = getParseableSourceSnapshot({ filePath: file, text: source }).sourceFile;
    const identifiers = sanitizedIdentifiers(sourceFile);
    const canonicalSanitizer = file === CANONICAL_OWNER && hasCanonicalSanitizer(sourceFile);
    const visit = (node) => {
      if (innerHtmlAssignment(node)) {
        const safe = canonicalSanitizer && sanitizedRightHandSide(node.right, identifiers);
        if (!safe) {
          violations.push({
            rule: 'security-inner-html-owner',
            file,
            line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
            message:
              'direct innerHTML assignment must remain in the canonical HTML sanitizer and use ' +
              'sanitizeHtmlFragment provenance',
          });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  return { files, violations };
}

export function runHtmlSanitizerOwnershipCheck(explicitFiles = []) {
  return collectHtmlSanitizerOwnershipViolations(collectCodeFiles(explicitFiles));
}

if (isExecutedAsScript(import.meta.url)) {
  const { violations } = runHtmlSanitizerOwnershipCheck(parseFilesArgument(process.argv.slice(2)));
  if (violations.length > 0) {
    printViolations('HTML sanitizer ownership violations found:', violations);
    process.exit(1);
  }
  process.stdout.write('HTML sanitizer ownership passed\n');
}
