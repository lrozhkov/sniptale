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
} from '../authority/architecture-authority-state-signals.mjs';
import { createViolation, isProductionSourceFile, readSourceFile } from './helpers.mjs';
import { repoRoot, toRelativePath } from '../../../analysis/repository/shared-paths.mjs';
import { applyRepositoryFindingBaseline } from '../../../policy/baselines/repository-finding-baseline.mjs';

export const POLICY_STATE_REGISTRY_PATH =
  'apps/extension/src/background/routing-contracts/policy-state/registry.ts';
const POLICY_STATE_OWNER_PATH = 'apps/extension/src/background/routing-contracts/policy-state';
const POLICY_STATE_BASELINE_PATH = 'tooling/configs/qa/policy-state-repository-baseline.json';

export function collectPolicyStateInventory({ root = repoRoot } = {}) {
  if (!architectureFileExists(root, POLICY_STATE_REGISTRY_PATH)) {
    return { descriptorCount: 0, exists: false, ids: [] };
  }
  const ids = [...new Set(collectPolicyStateOwnerIds(root))].sort();
  return { descriptorCount: ids.length, exists: true, ids };
}

function collectPolicyStateOwnerIds(root) {
  const ownerDirectory = path.join(root, POLICY_STATE_OWNER_PATH);
  return fs
    .readdirSync(ownerDirectory)
    .filter((file) => file.endsWith('.ts') && !file.includes('.test.'))
    .flatMap((file) => {
      const relativePath = path.posix.join(POLICY_STATE_OWNER_PATH, file);
      const sourceFile = ts.createSourceFile(
        relativePath,
        readArchitectureFileText(root, relativePath),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS
      );
      const ids = [];
      function visit(node) {
        if (
          ts.isPropertyAssignment(node) &&
          propertyNameText(node.name) === 'id' &&
          (ts.isStringLiteral(node.initializer) ||
            ts.isNoSubstitutionTemplateLiteral(node.initializer))
        ) {
          ids.push(node.initializer.text);
        }
        ts.forEachChild(node, visit);
      }
      visit(sourceFile);
      return ids;
    });
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

function hasCanonicalPolicyStateRegistration(sourceFile) {
  let found = false;
  function visit(node) {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      ['definePolicyStateOwner', 'registerPolicyStateOwner'].includes(node.expression.text)
    ) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return found;
}

export function collectPolicyStateDescriptorViolations(files, options = {}) {
  const root = options.root ?? repoRoot;
  const inventory = collectPolicyStateInventory({ root });
  if (!inventory.exists) {
    return [
      createViolation(
        'policy-state-registry-missing',
        POLICY_STATE_REGISTRY_PATH,
        'Policy-state registry is missing; authority-state descriptor validation cannot run.'
      ),
    ];
  }
  return collectPolicyStateDescriptorViolationsForFiles(files, {
    enforceAll: options.enforceAll === true,
    knownPolicyStateIds: new Set(inventory.ids),
    newFiles: options.newFiles ?? new Set(),
    root,
  });
}

function collectPolicyStateDescriptorViolationsForFiles(
  files,
  { enforceAll, knownPolicyStateIds, newFiles, root }
) {
  const violations = files
    .map(toRelativePath)
    .filter(isProductionSourceFile)
    .sort()
    .flatMap((file) =>
      collectPolicyStateDescriptorViolationsForFile(file, {
        enforceAll,
        knownPolicyStateIds,
        newFiles,
        root,
      })
    );
  if (!enforceAll) return violations;
  const baselineCandidates = violations.filter(
    ({ rule }) => rule === 'policy-state-descriptor-required'
  );
  const baseline = applyRepositoryFindingBaseline({
    baselinePath: POLICY_STATE_BASELINE_PATH,
    controlId: 'qa.rule.policy-state-descriptor',
    findings: baselineCandidates,
  });
  return [
    ...violations.filter(({ rule }) => rule !== 'policy-state-descriptor-required'),
    ...baseline.violations,
  ];
}

function collectPolicyStateDescriptorViolationsForFile(
  file,
  { enforceAll, knownPolicyStateIds, newFiles, root }
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
      enforceAll,
      newFiles,
      policyStateReferences,
      sourceFile,
      text,
    }),
  ];
}

function shouldSkipPolicyStateDescriptorScan(root, file) {
  return (
    !architectureFileExists(root, file) ||
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

function collectMissingPolicyStateIdViolations({
  file,
  enforceAll,
  newFiles,
  policyStateReferences,
  sourceFile,
  text,
}) {
  const authorityStateReasons = collectAuthorityStateReasons({ file, sourceFile, text });
  if (
    (!enforceAll && !newFiles.has(file)) ||
    authorityStateReasons.length === 0 ||
    policyStateReferences.length > 0 ||
    hasCanonicalPolicyStateRegistration(sourceFile)
  ) {
    return [];
  }
  return [
    createViolation(
      'policy-state-descriptor-required',
      file,
      [
        'Authority/capability state must reference policyStateId or policyStateIds.',
        `Signals: ${authorityStateReasons.join(', ')}.`,
      ].join(' ')
    ),
  ];
}
