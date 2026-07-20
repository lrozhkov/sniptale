import { posix } from 'node:path';

function linkLiteral(raw) {
  const trimmed = raw.trim();
  if (trimmed.startsWith('<')) {
    const end = trimmed.indexOf('>');
    return end > 1 ? trimmed.slice(1, end) : '';
  }
  const whitespace = trimmed.search(/\s/u);
  return whitespace < 0 ? trimmed : trimmed.slice(0, whitespace);
}

export function markdownLinkLiterals(text) {
  const literals = [];
  let cursor = 0;
  while (cursor < text.length) {
    const start = text.indexOf('](', cursor);
    if (start < 0) break;
    const end = text.indexOf(')', start + 2);
    if (end < 0) break;
    const literal = linkLiteral(text.slice(start + 2, end));
    if (literal) literals.push(literal);
    cursor = end + 1;
  }
  return literals;
}

export function markdownReferenceDefinitionLines(text) {
  const lines = text.split(/\r?\n/u);
  const definitions = [];
  let fenced = false;
  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim();
    if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
      fenced = !fenced;
      continue;
    }
    const close = trimmed.indexOf(']:');
    if (!fenced && trimmed.startsWith('[') && close > 1) definitions.push(index + 1);
  }
  return definitions;
}

function proseLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const quote = trimmed.startsWith('> ') ? trimmed.slice(2).trimStart() : trimmed;
  if (
    /^(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|```|~~~|\| |<|={3,}$|-{3,}$)/u.test(quote) ||
    /^\[[^\]]+\]:/u.test(quote)
  ) {
    return null;
  }
  return quote;
}

export function markdownHardWrapLines(text) {
  const lines = text.split(/\r?\n/u);
  const violations = [];
  let fenced = false;
  let frontmatter = lines[0]?.trim() === '---';
  let htmlComment = false;
  let previousProse = false;
  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim();
    if (frontmatter) {
      if (index > 0 && trimmed === '---') frontmatter = false;
      previousProse = false;
      continue;
    }
    if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
      fenced = !fenced;
      previousProse = false;
      continue;
    }
    if (fenced) continue;
    if (trimmed.startsWith('<!--')) htmlComment = true;
    if (htmlComment) {
      if (trimmed.includes('-->')) htmlComment = false;
      previousProse = false;
      continue;
    }
    const currentProse = proseLine(line) !== null;
    if (currentProse && previousProse) violations.push(index + 1);
    previousProse = currentProse || (/^(?:[-*+]\s|\d+[.)]\s)/u.test(trimmed) && trimmed.length > 2);
  }
  return violations;
}

export function hasCloneSpecificPath(text) {
  return text.split(/\r?\n/u).some((line) => {
    const normalized = line.replaceAll('\\', '/');
    const marker = normalized.toLowerCase().indexOf('sniptale/');
    if (marker < 0) return false;
    let start = marker;
    while (start > 0 && !/[\s("'`<]/u.test(normalized[start - 1])) start -= 1;
    const token = normalized.slice(start);
    return token.startsWith('/') || /^[A-Za-z]:\//u.test(token);
  });
}

export function resolvedMarkdownTarget(path, literal) {
  const withoutAnchor = decodeURI(literal.split('#')[0]);
  if (!withoutAnchor || /^(?:[a-z]+:|#)/iu.test(literal)) return null;
  return withoutAnchor.startsWith('/')
    ? withoutAnchor.slice(1)
    : posix.normalize(posix.join(posix.dirname(path), withoutAnchor));
}
