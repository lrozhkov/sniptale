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

const APP_CORE_ROOTS = new Set([
  'composition',
  'contracts',
  'features',
  'foundation',
  'platform',
  'ui',
  'workflows',
]);

export function deriveAppCoreOwnerPath(path) {
  const segments = path.split('/');
  if (
    segments[0] !== 'apps' ||
    segments[1] !== 'extension' ||
    segments[2] !== 'src' ||
    !APP_CORE_ROOTS.has(segments[3])
  ) {
    return null;
  }
  const ownerDepth = segments[3] === 'composition' && segments[4] === 'persistence' ? 6 : 5;
  return segments.slice(0, Math.min(ownerDepth, segments.length)).join('/');
}

export function collectAppCoreOwnerProjection(files) {
  return [...new Set(files.map(deriveAppCoreOwnerPath).filter(Boolean))].sort();
}
