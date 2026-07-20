/**
 * Shared AI-limit analysis used by repo sweep and deterministic quality gates.
 */

import { encoding_for_model } from 'tiktoken';

import {
  CODE_COMMENT_DECLARATION_PATTERN,
  CODE_COMMENT_KEYWORD_PATTERN,
  QUALITY_LIMITS,
} from './quality.config.mjs';
import { isDataCarrierFile, isTokenBudgetFile, readText, splitLines } from './shared.mjs';

function getDeadCommentRuns(relativePath, lines) {
  const runs = [];
  let currentRun = [];

  const flush = () => {
    if (currentRun.length >= QUALITY_LIMITS.deadCommentRunLength) {
      const codeLikeLines = currentRun.filter(
        (entry) =>
          CODE_COMMENT_KEYWORD_PATTERN.test(entry.text) ||
          CODE_COMMENT_DECLARATION_PATTERN.test(entry.text)
      );
      if (codeLikeLines.length >= QUALITY_LIMITS.deadCommentRunLength - 1) {
        runs.push({
          file: relativePath,
          line: currentRun[0].line,
          endLine: currentRun[currentRun.length - 1].line,
          message: `contains ${currentRun.length} consecutive code-like comment lines`,
          rule: 'dead-comment-block',
        });
      }
    }
    currentRun = [];
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith('//')) {
      flush();
      return;
    }

    const commentBody = trimmed.slice(2).trim();
    if (!commentBody) {
      flush();
      return;
    }

    currentRun.push({ line: index + 1, text: commentBody });
  });

  flush();
  return runs;
}

function collectLineViolations(relativePath, lines, checks) {
  if (
    !checks.has('lines') ||
    isDataCarrierFile(relativePath) ||
    lines.length <= QUALITY_LIMITS.maxFileLines
  ) {
    return [];
  }

  return [
    {
      rule: 'max-file-lines',
      file: relativePath,
      message: `has ${lines.length} lines (limit ${QUALITY_LIMITS.maxFileLines})`,
    },
  ];
}

function collectStaticViolations(relativePath, lines, checks) {
  if (!checks.has('static') || isDataCarrierFile(relativePath)) {
    return [];
  }

  const longStringPattern = /(["'`])(?:\\.|(?!\1)[\s\S]){500,}\1/gu;
  const violations = [];

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
      return;
    }
    if (line.length > QUALITY_LIMITS.maxStaticLineLength && longStringPattern.test(line)) {
      violations.push({
        rule: 'long-static-line',
        file: relativePath,
        line: index + 1,
        message: `contains a ${line.length}-character inline static line outside *.constants.ts or *.data.ts`,
      });
    }
    longStringPattern.lastIndex = 0;
  });

  return violations;
}

function collectTokenData(relativePath, source, checks, encoding) {
  if (!checks.has('tokens') || !isTokenBudgetFile(relativePath) || !encoding) {
    return {
      hotspots: [],
      violations: [],
    };
  }

  const tokens = encoding.encode(source).length;
  return {
    hotspots: [
      {
        file: relativePath,
        tokens,
      },
    ],
    violations:
      tokens > QUALITY_LIMITS.maxLogicTokens
        ? [
            {
              rule: 'max-file-tokens',
              file: relativePath,
              message: `contains ${tokens} tokens (limit ${QUALITY_LIMITS.maxLogicTokens})`,
            },
          ]
        : [],
  };
}

export function collectAiLimitReport(
  relativePaths,
  requestedChecks = ['lines', 'tokens', 'static', 'comments']
) {
  const checks = new Set(requestedChecks);
  const encoding = checks.has('tokens') ? encoding_for_model('gpt-4o-mini') : null;
  const violations = [];
  const tokenHotspots = [];
  const lineHotspots = [];

  try {
    for (const relativePath of relativePaths) {
      const source = readText(relativePath);
      const lines = splitLines(source);

      lineHotspots.push({
        file: relativePath,
        lines: lines.length,
      });

      violations.push(...collectLineViolations(relativePath, lines, checks));
      violations.push(...collectStaticViolations(relativePath, lines, checks));

      if (checks.has('comments')) {
        violations.push(...getDeadCommentRuns(relativePath, lines));
      }

      const tokenData = collectTokenData(relativePath, source, checks, encoding);
      tokenHotspots.push(...tokenData.hotspots);
      violations.push(...tokenData.violations);
    }
  } finally {
    encoding?.free();
  }

  tokenHotspots.sort((left, right) => right.tokens - left.tokens);
  lineHotspots.sort((left, right) => right.lines - left.lines);

  return {
    violations,
    tokenHotspots,
    lineHotspots,
  };
}
