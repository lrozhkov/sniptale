import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { appCoreOwnerPolicyErrors } from './app-core-owner-policy-validation.mjs';

export { appCoreOwnerPolicyErrors };

export const APP_CORE_OWNER_POLICY_PATH = 'tooling/configs/qa/app-core-owner-policy.data.json';

export function readAppCoreOwnerPolicy(root = process.cwd()) {
  const policy = JSON.parse(readFileSync(resolve(root, APP_CORE_OWNER_POLICY_PATH), 'utf8'));
  const errors = appCoreOwnerPolicyErrors(policy);
  if (errors.length > 0) throw new Error(errors.join('; '));
  return policy;
}

export function classifyFinalAppCoreOwnerPath(path, policy) {
  const matches = policy.finalOwnerRules.filter(
    (rule) => path === rule.sourcePrefix || path.startsWith(`${rule.sourcePrefix}/`)
  );
  const longest = Math.max(0, ...matches.map((rule) => rule.sourcePrefix.length));
  const owners = matches.filter((rule) => rule.sourcePrefix.length === longest);
  if (owners.length !== 1) throw new Error(`unclassified final app-core owner: ${path}`);
  return owners[0];
}
