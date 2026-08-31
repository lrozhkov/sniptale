/**
 * Diff-aware suppression-directive guardrail.
 * Blocks new inline ESLint and TypeScript suppression comments in changed code.
 */

import fs from 'node:fs';
import ts from 'typescript';
import { collectCodeFiles } from '../../analysis/repository/shared-files.mjs';
import { isIgnoredRelativePath, toRelativePath } from '../../analysis/repository/shared-paths.mjs';
import {
  isExecutedAsScript,
  parseFilesArgument,
  printViolations,
} from '../../runtime/process/shared-cli.mjs';
import { isProductSourcePath } from '../../analysis/repository/src-production-targets.mjs';
import { collectChangedTargets } from '../../runtime/scope/changed-targets.helpers.mjs';

const JS_TS_FILE_PATTERN = /\.[cm]?[jt]sx?$/u;
const ESLINT_SUPPRESSION_PATTERN = /^eslint-disable(?:-next-line|-line)?\b/u;
const TYPESCRIPT_SUPPRESSION_PATTERN = /^@ts-(?:ignore|expect-error)\b/u;
const TYPESCRIPT_NOCHECK_PATTERN = /^@ts-nocheck\b/u;
const ESLINT_SUPPRESSION = {
  message:
    'introduces an ESLint suppression directive in production code. ' +
    'Fix the rule violation instead of muting it inline.',
  rule: 'eslint-suppression-directive',
};
const TYPESCRIPT_SUPPRESSION = {
  message:
    'introduces a TypeScript suppression directive in production code. ' +
    'Narrow the type locally or refactor the seam instead.',
  rule: 'typescript-suppression-directive',
};

function isSuppressionTarget(relativePath) {
  return JS_TS_FILE_PATTERN.test(relativePath) && !isIgnoredRelativePath(relativePath);
}

function isProductionSuppressionTarget(relativePath) {
  return (
    isSuppressionTarget(relativePath) &&
    isProductSourcePath(relativePath) &&
    !relativePath.includes('/test-harness/') &&
    !/\.(test|spec)\.[cm]?[jt]sx?$/u.test(relativePath)
  );
}

function createViolation(relativePath, line, suppressionRule) {
  return {
    rule: suppressionRule.rule,
    file: relativePath,
    line,
    message: suppressionRule.message,
  };
}

function normalizeCommentLine(line, lineIndex, lineCount, tokenKind) {
  let payload = line;
  if (tokenKind === ts.SyntaxKind.SingleLineCommentTrivia) {
    payload = payload.replace(/^\/\//u, '');
  } else {
    if (lineIndex === 0) payload = payload.replace(/^\/\*/u, '');
    if (lineIndex === lineCount - 1) payload = payload.replace(/\*\/$/u, '');
    payload = payload.replace(/^\s*\*/u, '');
  }
  return payload.trim();
}

function collectCommentSuppressions(relativePath, sourceText) {
  const sourceFile = ts.createSourceFile(relativePath, sourceText, ts.ScriptTarget.Latest, false);
  const firstStatementStart =
    sourceFile.statements[0]?.getStart(sourceFile) ?? Number.POSITIVE_INFINITY;
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    false,
    ts.LanguageVariant.Standard,
    sourceText
  );
  const violations = [];

  for (
    let tokenKind = scanner.scan();
    tokenKind !== ts.SyntaxKind.EndOfFileToken;
    tokenKind = scanner.scan()
  ) {
    if (
      tokenKind !== ts.SyntaxKind.SingleLineCommentTrivia &&
      tokenKind !== ts.SyntaxKind.MultiLineCommentTrivia
    ) {
      continue;
    }

    const tokenText = scanner.getTokenText();
    const startLine = sourceFile.getLineAndCharacterOfPosition(scanner.getTokenPos()).line + 1;
    const lines = tokenText.split(/\r?\n/u);
    for (const [lineIndex, line] of lines.entries()) {
      const payload = normalizeCommentLine(line, lineIndex, lines.length, tokenKind);
      const lineNumber = startLine + lineIndex;
      if (ESLINT_SUPPRESSION_PATTERN.test(payload)) {
        violations.push(createViolation(relativePath, lineNumber, ESLINT_SUPPRESSION));
      } else if (
        tokenKind === ts.SyntaxKind.SingleLineCommentTrivia &&
        (TYPESCRIPT_SUPPRESSION_PATTERN.test(payload) ||
          (TYPESCRIPT_NOCHECK_PATTERN.test(payload) && scanner.getTokenPos() < firstStatementStart))
      ) {
        violations.push(createViolation(relativePath, lineNumber, TYPESCRIPT_SUPPRESSION));
      }
    }
  }

  return violations;
}

/**
 * Collect suppression-directive violations from code files.
 *
 * @param {string[]} files
 * @param {{ changedLineMap?: Map<string, Set<number>>, untrackedFiles?: Set<string> }} [options]
 * @returns {{ rule: string, file: string, line: number, message: string }[]}
 */
export function collectSuppressionDirectiveViolations(
  files,
  { changedLineMap = new Map(), untrackedFiles = new Set() } = {}
) {
  const violations = [];

  for (const filePath of files) {
    const relativePath = toRelativePath(filePath);
    if (!isSuppressionTarget(relativePath)) {
      continue;
    }

    const changedLineNumbers = untrackedFiles.has(relativePath)
      ? null
      : (changedLineMap.get(relativePath) ?? null);
    const fileViolations = collectCommentSuppressions(
      relativePath,
      fs.readFileSync(filePath, 'utf8')
    );
    for (const violation of fileViolations) {
      const lineNumber = violation.line;
      if (changedLineNumbers != null && !changedLineNumbers.has(lineNumber)) {
        continue;
      }
      violations.push(violation);
    }
  }

  return violations;
}

/**
 * Run the suppression-directive guardrail over changed or explicit files.
 *
 * @param {{ files?: string[], scope?: 'workspace' | 'staged' | 'production' }} [options]
 * @returns {{ files: string[], violations: { rule: string, file: string, line: number, message: string }[] }}
 */
export function runSuppressionDirectiveCheck({ files = [], scope = 'workspace' } = {}) {
  if (files.length > 0) {
    const explicitFiles = files.filter((file) =>
      isProductionSuppressionTarget(toRelativePath(file))
    );

    return {
      files: explicitFiles.map(toRelativePath),
      violations: collectSuppressionDirectiveViolations(explicitFiles, {
        untrackedFiles: new Set(explicitFiles.map(toRelativePath)),
      }),
    };
  }

  if (scope === 'production') {
    const productionFiles = collectCodeFiles().filter(isProductionSuppressionTarget);

    return {
      files: productionFiles,
      violations: collectSuppressionDirectiveViolations(productionFiles),
    };
  }

  const targets = collectChangedTargets({ scope });
  const codeFiles = targets.changedFiles.filter(isProductionSuppressionTarget);

  return {
    files: codeFiles,
    violations: collectSuppressionDirectiveViolations(codeFiles, {
      changedLineMap: targets.changedLineMap,
      untrackedFiles: targets.untrackedFiles,
    }),
  };
}

if (isExecutedAsScript(import.meta.url)) {
  const argv = process.argv.slice(2);
  const files = parseFilesArgument(argv);
  const scope = argv.includes('--production')
    ? 'production'
    : argv.includes('--staged')
      ? 'staged'
      : 'workspace';
  const result = runSuppressionDirectiveCheck({ files, scope });

  if (result.violations.length > 0) {
    printViolations('Suppression directive violations found:', result.violations);
    process.exit(1);
  }

  process.stdout.write('Suppression directive policy passed\n');
}
