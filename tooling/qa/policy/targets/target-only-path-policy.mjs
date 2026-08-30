import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const TARGET_ONLY_PATH_POLICY = 'tooling/configs/qa/target-only-paths.data.json';

function validPaths(value) {
  return (
    Array.isArray(value) &&
    value.every(
      (path) =>
        typeof path === 'string' && path.length > 0 && !path.startsWith('/') && !path.includes('..')
    ) &&
    new Set(value).size === value.length
  );
}

function sortedPaths(value) {
  return value.every((path, index) => index === 0 || value[index - 1] < path);
}

export function targetOnlyPathPolicyErrors(policy) {
  if (
    policy?.schemaVersion !== 2 ||
    !validPaths(policy.physicalRetiredRoots) ||
    !validPaths(policy.retiredRootFiles) ||
    !validPaths(policy.retiredControlPrefixes) ||
    !validPaths(policy.effectV1RetiredPaths) ||
    !sortedPaths(policy.effectV1RetiredPaths) ||
    !validPaths(policy.requiredTargets) ||
    !Array.isArray(policy.retiredControls) ||
    policy.retiredControls.some(
      (entry) =>
        !validPaths([entry?.path]) ||
        !['remove', 'replace'].includes(entry?.action) ||
        (entry.action === 'replace' ? !validPaths([entry.target]) : entry.target !== undefined)
    )
  ) {
    return ['invalid target-only path policy'];
  }
  const retiredPaths = policy.retiredControls.map((entry) => entry.path);
  return new Set(retiredPaths).size === retiredPaths.length
    ? []
    : ['duplicate target-only retired control'];
}

export function readTargetOnlyPathPolicy(root = process.cwd()) {
  const policy = JSON.parse(readFileSync(resolve(root, TARGET_ONLY_PATH_POLICY), 'utf8'));
  const errors = targetOnlyPathPolicyErrors(policy);
  if (errors.length > 0) throw new Error(errors.join('; '));
  return policy;
}
