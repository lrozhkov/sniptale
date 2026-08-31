import {
  CODE_COMMENT_DECLARATION_PATTERN,
  CODE_COMMENT_KEYWORD_PATTERN,
  QUALITY_LIMITS,
} from '../../../../policy/quality/quality.config.mjs';

function createViolation(relativePath, run, kind) {
  return {
    rule: 'dead-comment-block',
    file: relativePath,
    line: run[0].line,
    endLine: run.at(-1).line,
    message: `contains ${run.length} consecutive code-like ${kind} lines`,
  };
}

function isCodeLike(text) {
  return CODE_COMMENT_KEYWORD_PATTERN.test(text) || CODE_COMMENT_DECLARATION_PATTERN.test(text);
}

function collectQualifiedRun(relativePath, run, kind) {
  if (run.length < QUALITY_LIMITS.deadCommentRunLength) return [];
  return run.filter(({ text }) => isCodeLike(text)).length >=
    QUALITY_LIMITS.deadCommentRunLength - 1
    ? [createViolation(relativePath, run, kind)]
    : [];
}

function collectLineCommentRuns(relativePath, lines) {
  const violations = [];
  let run = [];
  const flush = () => {
    violations.push(...collectQualifiedRun(relativePath, run, 'comment'));
    run = [];
  };
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith('//') || trimmed.slice(2).trim().length === 0) {
      flush();
      return;
    }
    run.push({ line: index + 1, text: trimmed.slice(2).trim() });
  });
  flush();
  return violations;
}

function collectBlockCommentRuns(relativePath, lines) {
  const violations = [];
  let run = [];
  let inBlock = false;
  const flush = () => {
    violations.push(...collectQualifiedRun(relativePath, run, 'block-comment'));
    run = [];
  };
  lines.forEach((line, index) => {
    let text = line.trim();
    if (!inBlock) {
      if (!text.startsWith('/*') || text.startsWith('/**')) return;
      inBlock = true;
      text = text.slice(2);
    }
    const closes = text.includes('*/');
    text = text
      .split('*/', 1)[0]
      .replace(/^\s*\*?\s?/u, '')
      .trim();
    if (text.length > 0) run.push({ line: index + 1, text });
    if (closes) {
      flush();
      inBlock = false;
    }
  });
  if (inBlock) flush();
  return violations;
}

export function collectDeadCommentRuns(relativePath, lines) {
  return [
    ...collectLineCommentRuns(relativePath, lines),
    ...collectBlockCommentRuns(relativePath, lines),
  ].sort((left, right) => left.line - right.line);
}
