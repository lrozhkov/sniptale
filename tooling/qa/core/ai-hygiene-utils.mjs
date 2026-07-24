import ts from 'typescript';

import {
  CODE_COMMENT_DECLARATION_PATTERN,
  CODE_COMMENT_KEYWORD_PATTERN,
  QUALITY_LIMITS,
} from './quality.config.mjs';
import { isDataCarrierFile, readText, splitLines } from './shared.mjs';

export function collectDeadCommentRuns(relativePath, lines) {
  const runs = [];
  let currentRun = [];
  const flush = () => {
    if (currentRun.length >= QUALITY_LIMITS.deadCommentRunLength) {
      const codeLike = currentRun.filter(
        ({ text }) =>
          CODE_COMMENT_KEYWORD_PATTERN.test(text) || CODE_COMMENT_DECLARATION_PATTERN.test(text)
      );
      if (codeLike.length >= QUALITY_LIMITS.deadCommentRunLength - 1) {
        runs.push({
          rule: 'dead-comment-block',
          file: relativePath,
          line: currentRun[0].line,
          endLine: currentRun.at(-1).line,
          message: `contains ${currentRun.length} consecutive code-like comment lines`,
        });
      }
    }
    currentRun = [];
  };
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith('//') || trimmed.slice(2).trim().length === 0) {
      flush();
      return;
    }
    currentRun.push({ line: index + 1, text: trimmed.slice(2).trim() });
  });
  flush();
  return runs;
}

function collectOversizedLiteralViolations(relativePath, source) {
  if (isDataCarrierFile(relativePath) || !/\.(?:[cm]?[jt]sx?|mjs|cjs)$/u.test(relativePath)) {
    return [];
  }
  const sourceFile = ts.createSourceFile(relativePath, source, ts.ScriptTarget.Latest, true);
  const violations = [];
  function visit(node) {
    if (
      (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
      node.text.length > QUALITY_LIMITS.maxGeneratedDataLineLength
    ) {
      const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
      violations.push({
        rule: 'oversized-inline-literal',
        file: relativePath,
        line,
        message: [
          `contains a ${node.text.length}-character inline literal;`,
          'move classified data to an owned data/fixture file',
        ].join(' '),
      });
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return violations;
}

export function collectAiHygieneReport(relativePaths) {
  const violations = [];
  for (const relativePath of relativePaths) {
    const source = readText(relativePath);
    violations.push(...collectDeadCommentRuns(relativePath, splitLines(source)));
    violations.push(...collectOversizedLiteralViolations(relativePath, source));
  }
  return { violations };
}
