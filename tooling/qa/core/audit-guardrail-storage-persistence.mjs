import ts from 'typescript';

import { createViolation } from './audit-guardrail-shared.mjs';
import { isPersistenceAuthorityOwner } from './audit-guardrail-storage-owners.mjs';
import { getNodeLine, scanRepoScopedTypeScriptFiles } from './repo-scoped-typescript-scan.mjs';

const STORAGE_MUTATION_MESSAGE = [
  'Runtime/UI persistence paths must use queued/CAS/revision mutation owners',
  'instead of direct whole-record save calls.',
].join(' ');
const PERSISTENCE_AUTHORITY_MESSAGE = [
  'IndexedDB entrypoints must stay behind explicit persistence authorities',
  'instead of opening browser databases from ad hoc runtime/UI seams.',
].join(' ');

export function collectStorageMutationOwnershipViolations(files) {
  const violations = [];
  scanRepoScopedTypeScriptFiles(files, {
    includeTestLikeFiles: false,
    targetFilePatterns: [
      /^src\/(?:background|content|popup|settings|gallery|editor|video-editor|scenario-editor|offscreen)\//u,
      /^apps\/extension\/src\/(?:editor|scenario-editor|video-editor)\//u,
      /^apps\/extension\/src\/(?:camera-recorder|design-system|gallery|popup|settings)\//u,
      /^apps\/extension\/src\/web-snapshot-viewer\//u,
    ],
    visitFile: ({ normalizedPath, sourceFile }) => {
      const visit = (node) => {
        if (!ts.isCallExpression(node)) {
          ts.forEachChild(node, visit);
          return;
        }

        const text = node.getText(sourceFile);
        const callee = node.expression.getText(sourceFile);
        const isDirectPersistenceCall =
          /^(?:saveVideoProject|saveScenarioProjectV3?|saveRuntimeDefaultModelId)$/u.test(callee) ||
          /^(?:saveAIProvider|deleteAIProvider)$/u.test(callee);
        const hasMutationProof =
          /\b(?:mutate|mutation|queue|baseRevision|revision|capabilityToken)\b/u.test(text);
        if (isDirectPersistenceCall && !hasMutationProof) {
          violations.push(
            createViolation(
              'storage-mutation-owner-bypass',
              normalizedPath,
              getNodeLine(sourceFile, node),
              STORAGE_MUTATION_MESSAGE
            )
          );
        }
        ts.forEachChild(node, visit);
      };
      ts.forEachChild(sourceFile, visit);
    },
  });
  return violations;
}

function createPersistenceAuthorityViolation(normalizedPath, sourceFile, node) {
  return createViolation(
    'persistence-authority-owner-bypass',
    normalizedPath,
    getNodeLine(sourceFile, node),
    PERSISTENCE_AUTHORITY_MESSAGE
  );
}

function isIdbImport(node) {
  return (
    ts.isImportDeclaration(node) &&
    ts.isStringLiteral(node.moduleSpecifier) &&
    node.moduleSpecifier.text === 'idb'
  );
}

function isDirectIndexedDbCall(node, sourceFile) {
  if (!ts.isCallExpression(node)) {
    return false;
  }

  const callee = node.expression.getText(sourceFile);
  return callee === 'openDB' || callee.startsWith('indexedDB.');
}

export function collectPersistenceAuthorityViolations(files) {
  const violations = [];

  scanRepoScopedTypeScriptFiles(files, {
    includeTestLikeFiles: false,
    targetFilePatterns: [/^(?:src|apps\/extension\/src)\//u],
    visitFile: ({ normalizedPath, sourceFile }) => {
      if (isPersistenceAuthorityOwner(normalizedPath)) {
        return;
      }

      const visit = (node) => {
        if (isIdbImport(node)) {
          violations.push(createPersistenceAuthorityViolation(normalizedPath, sourceFile, node));
          return;
        }

        if (isDirectIndexedDbCall(node, sourceFile)) {
          violations.push(createPersistenceAuthorityViolation(normalizedPath, sourceFile, node));
        }

        ts.forEachChild(node, visit);
      };

      ts.forEachChild(sourceFile, visit);
    },
  });

  return violations;
}
