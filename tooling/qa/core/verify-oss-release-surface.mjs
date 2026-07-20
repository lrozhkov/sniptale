import { readOssReleasePolicy } from '../../release/oss-release-policy.mjs';
import { createOssReleaseInventory } from './oss-release-inventory.mjs';
import { validateConsumers, validateDocuments } from './oss-release-validation.docs.mjs';
import {
  validateLegalFiles,
  validateNoticeContents,
  validatePolicyShape,
} from './oss-release-validation.policy.mjs';
import { validateBundledAssets, validatePackages } from './oss-release-validation.tree.mjs';
import { validateDependencyLegalClosureSync } from './dependency-legal-validation-adapter.mjs';

function readPolicy(root) {
  try {
    return { errors: [], policy: readOssReleasePolicy(root) };
  } catch {
    return { errors: ['OSS release policy is missing or invalid'], policy: null };
  }
}

function createInventory(root, policy) {
  try {
    return { errors: [], inventory: createOssReleaseInventory(root, policy) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { errors: [`OSS release inventory generation failed: ${message}`], inventory: null };
  }
}

export function collectOssReleaseSurfaceErrors(root = process.cwd()) {
  const policyResult = readPolicy(root);
  if (!policyResult.policy) return policyResult.errors;
  const shapeErrors = validatePolicyShape(policyResult.policy);
  if (shapeErrors.length > 0) return shapeErrors;
  const inventoryResult = createInventory(root, policyResult.policy);
  if (!inventoryResult.inventory) return inventoryResult.errors;
  return [
    ...validateLegalFiles(root, policyResult.policy),
    ...validateNoticeContents(root, policyResult.policy),
    ...validateDependencyLegalClosureSync(root),
    ...validatePackages(root, policyResult.policy, inventoryResult.inventory),
    ...validateBundledAssets(root, policyResult.policy, inventoryResult.inventory),
    ...validateDocuments(root, policyResult.policy),
    ...validateConsumers(root, policyResult.policy, inventoryResult.inventory),
  ];
}

export function runOssReleaseSurfaceCheck(options = {}) {
  const root = typeof options === 'string' ? options : (options.root ?? process.cwd());
  return { violations: collectOssReleaseSurfaceErrors(root) };
}
