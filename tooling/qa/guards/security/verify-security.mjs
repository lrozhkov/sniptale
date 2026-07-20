/**
 * Deterministic local security gate.
 * Runs ESLint security rules and blocks obvious unsafe sinks like eval/new Function/raw innerHTML.
 */

import ts from 'typescript';

import { SECURITY_IGNORE_PATTERNS } from '../../core/quality.config.mjs';
import {
  collectCodeFiles,
  filterAllowedViolations,
  isExecutedAsScript,
  loadBaseline,
  matchesAny,
  parseFilesArgument,
  printViolations,
  readText,
} from '../../core/shared.mjs';
import { lintWithEslint } from '../../core/verify-eslint.mjs';

const SECURITY_VERIFIER_PATH = 'tooling/qa/guards/security/verify-security.mjs';

function hasVisibleHtmlEscaping(source) {
  return (
    source.includes(".replace(/&/g, '&amp;')") &&
    source.includes(".replace(/</g, '&lt;')") &&
    source.includes(".replace(/>/g, '&gt;')")
  );
}

function isCanonicalInnerHtmlOwner(file) {
  return file === 'packages/platform/src/security/sanitizers/html.ts';
}

function pushPatternViolations(lines, file, pattern, rule, message, violations) {
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('//')) {
      return;
    }
    if (pattern.test(line)) {
      violations.push({
        rule,
        file,
        line: index + 1,
        message,
      });
    }
  });
}

function pushHtmlViolations(lines, file, fileHasVisibleEscaping, violations) {
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('//')) {
      return;
    }

    if (/dangerouslySetInnerHTML/u.test(line) && !fileHasVisibleEscaping) {
      violations.push({
        rule: 'security-dangerously-set-inner-html',
        file,
        line: index + 1,
        message:
          'uses dangerouslySetInnerHTML without a visible HTML escaping helper in the same file',
      });
    }

    if (/\.innerHTML\s*=/u.test(line) && !isCanonicalInnerHtmlOwner(file)) {
      violations.push({
        rule: 'security-inner-html',
        file,
        line: index + 1,
        message: 'assigns to innerHTML outside the canonical shared HTML sanitizer seam',
      });
    }
  });
}

function unwrapParentheses(node) {
  return ts.isParenthesizedExpression(node) ? unwrapParentheses(node.expression) : node;
}

function collectFunctionConstructorSinkLines(file, source) {
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const sinkLines = [];
  function visit(node) {
    if (
      (ts.isNewExpression(node) || ts.isCallExpression(node)) &&
      ts.isIdentifier(unwrapParentheses(node.expression)) &&
      unwrapParentheses(node.expression).text === 'Function'
    ) {
      sinkLines.push(sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return sinkLines;
}

function pushFunctionConstructorViolations(file, source, violations) {
  const sinkLines = collectFunctionConstructorSinkLines(file, source);
  for (const line of sinkLines) {
    violations.push({
      rule: 'security-function-constructor',
      file,
      line,
      message: 'uses the Function constructor',
    });
  }
}

export function collectSecurityViolations(relativePaths, { readSource = readText } = {}) {
  const jsLikeFiles = relativePaths.filter(
    (file) =>
      /\.(?:ts|tsx|js|mjs|cjs)$/.test(file) &&
      (file === SECURITY_VERIFIER_PATH || !matchesAny(file, SECURITY_IGNORE_PATTERNS))
  );
  const customViolations = [];

  for (const file of jsLikeFiles) {
    const source = readSource(file);
    const lines = source.split(/\r?\n/u);
    const fileHasVisibleEscaping = hasVisibleHtmlEscaping(source);
    const isVerifierImplementation = file === SECURITY_VERIFIER_PATH;

    if (!isVerifierImplementation) {
      pushPatternViolations(
        lines,
        file,
        /\beval\s*\(/u,
        'security-eval',
        'uses eval()',
        customViolations
      );
    }
    pushFunctionConstructorViolations(file, source, customViolations);
    pushHtmlViolations(lines, file, fileHasVisibleEscaping, customViolations);
  }

  return {
    files: jsLikeFiles,
    violations: customViolations,
  };
}

function mergeEslintResults(results) {
  return {
    failed: results.some((result) => result.failed),
    warningCount: results.reduce((count, result) => count + result.warningCount, 0),
    errorCount: results.reduce((count, result) => count + result.errorCount, 0),
    output: results
      .map((result) => result.output)
      .filter(Boolean)
      .join('\n'),
    results: results.flatMap((result) => result.results),
  };
}

export async function runSecurityCheck(explicitFiles = [], { lintRunner = lintWithEslint } = {}) {
  const files = collectCodeFiles(explicitFiles);
  const { files: jsLikeFiles, violations: customViolations } = collectSecurityViolations(files);

  const eslintResult =
    jsLikeFiles.length === 0
      ? { failed: false, warningCount: 0, errorCount: 0, output: '', results: [] }
      : mergeEslintResults([
          await lintRunner({
            files: jsLikeFiles,
            quiet: true,
            rulePrefix: 'security/',
          }),
          await lintRunner({
            files: jsLikeFiles,
            rulePrefix: 'security/detect-unsafe-regex',
            strict: true,
          }),
        ]);

  const violations = filterAllowedViolations(customViolations, loadBaseline());

  return {
    eslintResult,
    files: jsLikeFiles,
    violations,
  };
}

if (isExecutedAsScript(import.meta.url)) {
  const { eslintResult, violations } = await runSecurityCheck(
    parseFilesArgument(process.argv.slice(2))
  );

  if (eslintResult.output) {
    process.stdout.write(eslintResult.output);
  }
  if (eslintResult.failed) {
    process.exit(1);
  }

  if (violations.length > 0) {
    printViolations('Security violations found:', violations);
    process.exit(1);
  }

  process.stdout.write('Security checks passed\n');
}
