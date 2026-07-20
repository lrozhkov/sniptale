import { validateControlRows } from './policy-controls.mjs';
import { createInitialControlPolicy } from './policy-initialization.mjs';
import {
  validateExecutableRows,
  validatePolicyRows,
  validateScriptRows,
  validateValidationRows,
} from './policy-populations.mjs';
import { createViolation } from './policy-shared.mjs';

const ROOT_KEYS = new Set([
  'schemaVersion',
  'controls',
  'executables',
  'policyFiles',
  'scripts',
  'validationTools',
]);

function isPolicyShape(policy) {
  return (
    policy?.schemaVersion === 1 &&
    Array.isArray(policy.controls) &&
    Array.isArray(policy.executables) &&
    Array.isArray(policy.policyFiles) &&
    Array.isArray(policy.scripts) &&
    Array.isArray(policy.validationTools)
  );
}

export function collectControlPolicyViolations(
  discovery,
  policy,
  file = 'tooling/configs/qa/control-dispositions.data.json'
) {
  if (!isPolicyShape(policy)) {
    return [
      createViolation(
        'qa-control-policy-schema',
        file,
        'policy requires schemaVersion 1 and control/executable/policyFiles/scripts/validationTools arrays'
      ),
    ];
  }
  const unknownRootKeys = Object.keys(policy).filter((key) => !ROOT_KEYS.has(key));
  if (unknownRootKeys.length > 0) {
    return [
      createViolation(
        'qa-control-policy-unknown-key',
        file,
        `policy has unknown keys: ${unknownRootKeys.sort().join(', ')}`
      ),
    ];
  }
  return [
    ...validateControlRows(discovery, policy, file),
    ...validateExecutableRows(discovery, policy, file),
    ...validatePolicyRows(discovery, policy, file),
    ...validateScriptRows(discovery, policy, file),
    ...validateValidationRows(discovery, policy, file),
  ];
}

export { createInitialControlPolicy };
