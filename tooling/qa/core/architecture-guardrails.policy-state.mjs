import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

import {
  architectureFileExists,
  collectTopLevelAuthorityStateReasons,
  hasPrivilegedMemoryDomainSignal,
  hasResetForTestsSignal,
  isCapabilityStatePath,
  readArchitectureFileText,
} from './architecture-authority-state-signals.mjs';
import {
  createViolation,
  isProductionSourceFile,
  readSourceFile,
} from './architecture-guardrails.helpers.mjs';
import { repoRoot, toRelativePath } from './shared.mjs';

export const POLICY_STATE_REGISTRY_PATH =
  'apps/extension/src/background/routing-contracts/policy-state/registry.ts';
const POLICY_STATE_OWNER_PATH = 'apps/extension/src/background/routing-contracts/policy-state';

export function collectPolicyStateInventory({ root = repoRoot } = {}) {
  if (!architectureFileExists(root, POLICY_STATE_REGISTRY_PATH)) {
    return { descriptorCount: 0, exists: false, ids: [] };
  }
  const registryText = collectPolicyStateOwnerText(root);
  const ids = [
    ...new Set(
      [...registryText.matchAll(/\bid:\s*['"]([a-z0-9-]+)['"]/gu)].map((match) => match[1])
    ),
  ].sort();
  return { descriptorCount: ids.length, exists: true, ids };
}

function collectPolicyStateOwnerText(root) {
  const ownerDirectory = path.join(root, POLICY_STATE_OWNER_PATH);
  return fs
    .readdirSync(ownerDirectory)
    .filter((file) => file.endsWith('.ts') && !file.includes('.test.'))
    .map((file) => readArchitectureFileText(root, path.posix.join(POLICY_STATE_OWNER_PATH, file)))
    .join('\n');
}

function collectAuthorityStateReasons({ file, sourceFile, text }) {
  const reasons = [];
  if (isCapabilityStatePath(file)) {
    reasons.push('capability-path');
  }
  reasons.push(...collectTopLevelAuthorityStateReasons(sourceFile));
  if (hasResetForTestsSignal(text)) {
    reasons.push('reset-for-tests');
  }
  if (hasPrivilegedMemoryDomainSignal(text)) {
    reasons.push('privileged-memory-domain');
  }
  return reasons;
}

function propertyNameText(name) {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return null;
}

function collectStringLiterals(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return [node.text];
  }
  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.flatMap(collectStringLiterals);
  }
  return [];
}

function collectPolicyStateIdReferences(sourceFile) {
  const references = [];
  function visit(node) {
    if (ts.isPropertyAssignment(node)) {
      const name = propertyNameText(node.name);
      if (name === 'policyId' || name === 'policyStateId' || name === 'policyStateIds') {
        references.push(
          ...collectStringLiterals(node.initializer).map((id) => ({
            id,
            line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
          }))
        );
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return references;
}

export function collectPolicyStateDescriptorViolations(files, options = {}) {
  const root = options.root ?? repoRoot;
  const inventory = collectPolicyStateInventory({ root });
  if (!inventory.exists) {
    return [];
  }
  return collectPolicyStateDescriptorViolationsForFiles(files, {
    knownPolicyStateIds: new Set(inventory.ids),
    newFiles: options.newFiles ?? new Set(),
    root,
  });
}

function collectPolicyStateDescriptorViolationsForFiles(
  files,
  { knownPolicyStateIds, newFiles, root }
) {
  return files
    .map(toRelativePath)
    .filter(isProductionSourceFile)
    .sort()
    .flatMap((file) =>
      collectPolicyStateDescriptorViolationsForFile(file, { knownPolicyStateIds, newFiles, root })
    );
}

function collectPolicyStateDescriptorViolationsForFile(
  file,
  { knownPolicyStateIds, newFiles, root }
) {
  if (shouldSkipPolicyStateDescriptorScan(root, file)) {
    return [];
  }
  const sourceFile = readSourceFile(root, file);
  const text = readArchitectureFileText(root, file);
  const policyStateReferences = collectPolicyStateIdReferences(sourceFile);
  return [
    ...collectUnknownPolicyStateIdViolations(file, knownPolicyStateIds, policyStateReferences),
    ...collectMissingPolicyStateIdViolations({
      file,
      newFiles,
      sourceFile,
      text,
    }),
  ];
}

function shouldSkipPolicyStateDescriptorScan(root, file) {
  return (
    !architectureFileExists(root, file) ||
    file.startsWith('apps/extension/src/background/application/policy-state/') ||
    file.startsWith('apps/extension/src/background/routing-contracts/policy-state/') ||
    file.startsWith('apps/extension/src/background/routing-contracts/capabilities/policy/')
  );
}

function collectUnknownPolicyStateIdViolations(file, knownPolicyStateIds, references) {
  return references
    .filter((reference) => !knownPolicyStateIds.has(reference.id))
    .map((reference) =>
      createViolation(
        'unknown-policy-state-id',
        file,
        `Unknown policy-state id "${reference.id}" is not declared in ${POLICY_STATE_REGISTRY_PATH}.`,
        reference.line
      )
    );
}

function collectMissingPolicyStateIdViolations({ file, newFiles, sourceFile, text }) {
  const authorityStateReasons = collectAuthorityStateReasons({ file, sourceFile, text });
  if (
    !newFiles.has(file) ||
    authorityStateReasons.length === 0 ||
    /\bpolicy(?:State)?Id(?:s)?\b/u.test(text)
  ) {
    return [];
  }
  return [
    createViolation(
      'policy-state-descriptor-required',
      file,
      [
        'New authority/capability state must reference policyStateId or policyStateIds.',
        `Signals: ${authorityStateReasons.join(', ')}.`,
      ].join(' ')
    ),
  ];
}
