import {
  BROWSER_ADAPTER_RULES,
  isBrowserAdapterAllowedPath,
  isBrowserAdapterTestLikeFile,
} from '../../policy/browser-adapters/browser-adapters.mjs';
import { MESSAGING_RULES } from '../../policy/messaging/messaging.mjs';

const DESIGN_SYSTEM_RULES = [
  {
    rule: 'design-system-legacy-import-ts',
    violationRule: 'design-system-legacy-import',
    message: 'Use the canonical design-system owner instead of a retired UI import.',
    astGrepPattern: 'import-statement:legacy-design-system-path',
  },
  {
    rule: 'design-system-legacy-import-tsx',
    violationRule: 'design-system-legacy-import',
    message: 'Use the canonical design-system owner instead of a retired UI import.',
    astGrepPattern: 'import-statement:legacy-design-system-path',
  },
  {
    rule: 'design-system-raw-family-class',
    message: 'Use the canonical design-system component instead of raw product-family classes.',
    astGrepPattern: 'jsx-attribute:raw-design-system-family-class',
    fileExclusionAllow: false,
    allow: (relativePath) =>
      relativePath.startsWith('packages/ui/src/') ||
      relativePath.startsWith('apps/extension/src/design-system/previews/'),
  },
  {
    rule: 'design-system-direct-body-portal-ts',
    violationRule: 'design-system-direct-body-portal',
    message: 'Use the theme-safe portal owner instead of portalling directly to document.body.',
    astGrepPattern: 'createPortal($CONTENT, document.body)',
    fileExclusionAllow: false,
    allow: (relativePath) => relativePath === 'packages/ui/src/theme/safe-portal.tsx',
  },
  {
    rule: 'design-system-direct-body-portal-tsx',
    violationRule: 'design-system-direct-body-portal',
    message: 'Use the theme-safe portal owner instead of portalling directly to document.body.',
    astGrepPattern: 'createPortal($CONTENT, document.body)',
    fileExclusionAllow: false,
    allow: (relativePath) => relativePath === 'packages/ui/src/theme/safe-portal.tsx',
  },
];

const AST_GREP_RULE_GROUPS = {
  'browser-adapters': BROWSER_ADAPTER_RULES,
  messaging: MESSAGING_RULES,
  'design-system': DESIGN_SYSTEM_RULES,
};

export function selectAstGrepPolicies(groupIds) {
  return groupIds.flatMap((groupId) => AST_GREP_RULE_GROUPS[groupId] ?? []);
}

export const AST_GREP_CORE_GROUP_IDS = Object.freeze(Object.keys(AST_GREP_RULE_GROUPS));

export function isAstGrepAuditExcludedPath(relativePath, policies) {
  if (isBrowserAdapterAllowedPath(relativePath) || isBrowserAdapterTestLikeFile(relativePath)) {
    return true;
  }

  return policies.some(
    (policy) =>
      policy.fileExclusionAllow !== false &&
      typeof policy.allow === 'function' &&
      policy.allow(relativePath) === true
  );
}
