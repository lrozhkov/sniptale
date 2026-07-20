import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  hasCloneSpecificPath,
  markdownHardWrapLines,
  markdownLinkLiterals,
  markdownReferenceDefinitionLines,
  resolvedMarkdownTarget,
} from './docs-markdown-links.mjs';
import { readDocsTopologyPolicy } from './docs-topology-policy.mjs';
import { currentRepositoryPaths } from './target-only-path-inventory.mjs';

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
  const prettierIgnore = readFileSync(resolve(root, '.prettierignore'), 'utf8').split(/\r?\n/u);
  if (!prettierIgnore.includes('*.md'))
    errors.push('Markdown must remain excluded from formatting');
  return errors.sort();
}
