import { existsSync, readFileSync } from 'node:fs';
import { posix, resolve } from 'node:path';

import { readDocsTopologyPolicy } from './docs-topology-policy.mjs';
import { currentRepositoryPaths } from '../../policy/targets/target-only-path-inventory.mjs';

function linkLiteral(raw) {
  const trimmed = raw.trim();
  if (trimmed.startsWith('<')) {
    const end = trimmed.indexOf('>');
    return end > 1 ? trimmed.slice(1, end) : '';
  }
  const whitespace = trimmed.search(/\s/u);
  return whitespace < 0 ? trimmed : trimmed.slice(0, whitespace);
}

function markdownLinkLiterals(text) {
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

function markdownReferenceDefinitionLines(text) {
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

function markdownHardWrapLines(text) {
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

function hasCloneSpecificPath(text) {
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

function resolvedMarkdownTarget(path, literal) {
  const withoutAnchor = decodeURI(literal.split('#')[0]);
  if (!withoutAnchor || /^(?:[a-z]+:|#)/iu.test(literal)) return null;
  return withoutAnchor.startsWith('/')
    ? withoutAnchor.slice(1)
    : posix.normalize(posix.join(posix.dirname(path), withoutAnchor));
}

function allClassified(policy) {
  return [
    policy.activeIndex,
    ...policy.activeDocuments,
    ...policy.generatedDocuments,
    ...policy.rootDocuments,
    ...policy.skillDocuments,
    ...policy.productDocuments,
  ].sort();
}

function liveDocuments(policy) {
  return [
    policy.activeIndex,
    ...policy.activeDocuments,
    ...policy.generatedDocuments,
    ...policy.rootDocuments,
    ...policy.skillDocuments,
    ...policy.productDocuments,
  ];
}

function linkErrors(root, path) {
  const text = readFileSync(resolve(root, path), 'utf8');
  const errors = [];
  if (hasCloneSpecificPath(text)) errors.push(`clone-specific repository path: ${path}`);
  for (const line of markdownReferenceDefinitionLines(text)) {
    errors.push(`reference-style Markdown link is not allowed: ${path}:${line}`);
  }
  for (const literal of markdownLinkLiterals(text)) {
    const target = resolvedMarkdownTarget(path, literal);
    if (!target) continue;
    if (!existsSync(resolve(root, target))) {
      errors.push(`dangling Markdown link: ${path} -> ${literal}`);
    }
  }
  return errors;
}

function indexCoverageErrors(root, policy) {
  const text = readFileSync(resolve(root, policy.activeIndex), 'utf8');
  const linked = new Set(
    markdownLinkLiterals(text)
      .map((literal) => resolvedMarkdownTarget(policy.activeIndex, literal))
      .filter(Boolean)
  );
  return policy.activeDocuments
    .filter((path) => !linked.has(path))
    .map((path) => `active document is missing from ${policy.activeIndex}: ${path}`);
}

function retiredAuthorityErrors(root, path, policy) {
  const text = readFileSync(resolve(root, path), 'utf8');
  const fragments = [
    ...policy.forbiddenActiveFragments,
    ...policy.retiredActivePrefixes,
    ...policy.retiredActivePaths,
  ];
  return fragments
    .filter((fragment) => text.includes(fragment))
    .map((fragment) => `retired documentation authority in ${path}: ${fragment}`);
}

function naturalParagraphErrors(root, path) {
  if (!existsSync(resolve(root, path))) return [];
  const text = readFileSync(resolve(root, path), 'utf8');
  return markdownHardWrapLines(text).map(
    (line) => `documentation uses a hard-wrapped paragraph: ${path}:${line}`
  );
}

function indexContractErrors(root, policy) {
  const text = readFileSync(resolve(root, policy.activeIndex), 'utf8');
  return policy.requiredIndexContractFragments
    .filter((fragment) => !text.includes(fragment))
    .map((fragment) => `documentation index contract is incomplete: ${fragment}`);
}

function classificationErrors(root, policy, repositoryMarkdown, classified) {
  const errors = [];
  for (const path of repositoryMarkdown.filter((path) => !classified.includes(path))) {
    errors.push(`unclassified documentation: ${path}`);
  }
  for (const path of classified.filter((path) => !repositoryMarkdown.includes(path))) {
    errors.push(`classified documentation is missing: ${path}`);
  }
  for (const prefix of policy.retiredActivePrefixes) {
    if (currentRepositoryPaths(root).some((path) => path.startsWith(prefix))) {
      errors.push(`retired active documentation prefix remains: ${prefix}`);
    }
  }
  for (const path of policy.retiredActivePaths) {
    if (existsSync(resolve(root, path))) errors.push(`retired active document remains: ${path}`);
  }
  return errors;
}

export function docsTopologyErrors(root = process.cwd()) {
  const policy = readDocsTopologyPolicy(root);
  const repositoryMarkdown = currentRepositoryPaths(root)
    .filter((path) => path.endsWith('.md'))
    .sort();
  const classified = allClassified(policy);
  const errors = [
    ...indexCoverageErrors(root, policy),
    ...classificationErrors(root, policy, repositoryMarkdown, classified),
    ...indexContractErrors(root, policy),
  ];
  for (const path of liveDocuments(policy)) {
    if (existsSync(resolve(root, path))) {
      errors.push(...linkErrors(root, path), ...retiredAuthorityErrors(root, path, policy));
    }
  }
  const paragraphDocuments = [
    policy.activeIndex,
    ...policy.activeDocuments,
    ...policy.generatedDocuments,
    ...policy.rootDocuments,
    ...policy.skillDocuments,
    ...policy.productDocuments,
    'NOTICE',
  ];
  for (const path of paragraphDocuments) errors.push(...naturalParagraphErrors(root, path));
  const activeIndexes = [policy.activeIndex, ...policy.activeDocuments].filter((path) =>
    path.endsWith('/README.md')
  );
  if (activeIndexes.length !== 1) errors.push('docs must have exactly one active index');
  const formatterIgnore = readFileSync(resolve(root, '.oxfmtignore'), 'utf8').split(/\r?\n/u);
  if (!formatterIgnore.includes('*.md'))
    errors.push('Markdown must remain excluded from formatting');
  return errors.sort();
}
