import fs from 'node:fs';

import { resolveFocusedFiles } from './focused-qa-helpers.mjs';
import { collectCodeFiles } from './shared.mjs';
import { PRODUCT_QA_SUITE, createScopedQaContext } from './qa-scope.mjs';

export const OWNER_LOCAL_SCOPES = [
  { name: 'editor', prefix: 'apps/extension/src/editor/' },
  { name: 'video-editor', prefix: 'apps/extension/src/video-editor/' },
  { name: 'scenario-editor', prefix: 'apps/extension/src/scenario-editor/' },
  { name: 'popup', prefix: 'apps/extension/src/popup' },
  { name: 'settings', prefix: 'apps/extension/src/settings' },
  { name: 'gallery', prefix: 'apps/extension/src/gallery' },
  { name: 'design-system', prefix: 'apps/extension/src/design-system' },
];

const OWNER_LOCAL_ADJUNCT_PATTERNS = [/^docs\//u, /^\.agents\//u, /^AGENTS\.md$/u];

function findOwnerScope(file) {
  return OWNER_LOCAL_SCOPES.find((scope) => file.startsWith(scope.prefix)) ?? null;
}

function isOwnerLocalAdjunctFile(file) {
  return OWNER_LOCAL_ADJUNCT_PATTERNS.some((pattern) => pattern.test(file));
}

function buildFullSuiteResult(targetFiles, codeFiles, reason) {
  return {
    mode: 'full-suite',
    detail: reason,
    targetFiles,
    codeFiles,
    relatedFiles: [],
    ownerScope: null,
  };
}

function findOwnerLocalStructureIssue(targetFiles) {
  const ownerFiles = targetFiles.filter((file) => !isOwnerLocalAdjunctFile(file));
  const matchedScopes = ownerFiles.map(findOwnerScope).filter(Boolean);

  if (ownerFiles.length === 0 || matchedScopes.length === 0) {
    return `changed files are outside owner-local scopes (${targetFiles[0]})`;
  }

  const firstNonOwnerFile = ownerFiles.find((file) => findOwnerScope(file) === null);
  if (firstNonOwnerFile) {
    return `changed file requires full suite (${firstNonOwnerFile})`;
  }

  const uniqueScopes = [...new Set(matchedScopes.map((scope) => scope.prefix))];
  if (uniqueScopes.length !== 1) {
    return 'changed files span multiple owner-local scopes';
  }

  return null;
}

function resolveOwnerScope(targetFiles) {
  const firstOwnerFile =
    targetFiles.find((file) => !isOwnerLocalAdjunctFile(file)) ?? targetFiles[0];
  return findOwnerScope(firstOwnerFile);
}

function findCodeScopeIssue(codeFiles, ownerScope) {
  if (codeFiles.length === 0) {
    return `owner-local scope has no changed code files for related coverage (${ownerScope.name})`;
  }

  const firstNonOwnerCodeFile = codeFiles.find((file) => !file.startsWith(ownerScope.prefix));
  if (firstNonOwnerCodeFile) {
    return `changed code requires full suite (${firstNonOwnerCodeFile})`;
  }

  return null;
}

export function classifyFullVerifyScope({ targetFiles = [], codeFiles = [] } = {}) {
  if (targetFiles.length === 0) {
    return buildFullSuiteResult(targetFiles, codeFiles, 'no changed files detected');
  }

  const structureIssue = findOwnerLocalStructureIssue(targetFiles);
  if (structureIssue) {
    return buildFullSuiteResult(targetFiles, codeFiles, structureIssue);
  }

  const ownerScope = resolveOwnerScope(targetFiles);
  const codeIssue = findCodeScopeIssue(codeFiles, ownerScope);
  if (codeIssue) {
    return buildFullSuiteResult(targetFiles, codeFiles, codeIssue);
  }

  return {
    mode: 'owner-local-affected',
    detail: `${ownerScope.name} owner-local related coverage`,
    targetFiles,
    codeFiles,
    relatedFiles: [...codeFiles],
    ownerScope,
  };
}

export function resolveFullVerifyScope({ files = [] } = {}) {
  const allTargetFiles = resolveFocusedFiles(files);
  const allExistingTargetFiles = allTargetFiles.filter((file) => fs.existsSync(file));
  const scopedContext = createScopedQaContext(
    {
      targetFiles: allTargetFiles,
      existingTargetFiles: allExistingTargetFiles,
      codeFiles: collectCodeFiles(allExistingTargetFiles),
      jsLikeFiles: [],
      fingerprint: '',
    },
    { suite: PRODUCT_QA_SUITE }
  );
  const { targetFiles, codeFiles } = scopedContext;

  return {
    ...classifyFullVerifyScope({ targetFiles, codeFiles }),
    allTargetFiles: scopedContext.allTargetFiles,
    harnessTargetFiles: scopedContext.harnessTargetFiles,
  };
}
