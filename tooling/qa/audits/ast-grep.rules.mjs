import {
  BROWSER_ADAPTER_RULES,
  MESSAGING_RULES,
  isBrowserAdapterAllowedPath,
  isBrowserAdapterTestLikeFile,
} from '../policy/index.mjs';

const AST_GREP_RULE_GROUPS = {
  'browser-adapters': BROWSER_ADAPTER_RULES,
  messaging: MESSAGING_RULES,
};

export function selectAstGrepPolicies(groupIds) {
  return groupIds.flatMap((groupId) => AST_GREP_RULE_GROUPS[groupId] ?? []);
}

function serializeAstGrepConstraints(constraints = {}) {
  const entries = Object.entries(constraints);
  if (entries.length === 0) {
    return '';
  }

  const lines = ['constraints:'];
  for (const [name, descriptor] of entries) {
    lines.push(`  ${name}:`);
    for (const [key, value] of Object.entries(descriptor)) {
      lines.push(`    ${key}: '${String(value).replaceAll("'", "''")}'`);
    }
  }
  return `${lines.join('\n')}\n`;
}

function serializeAstGrepRule(policy) {
  return [
    `id: ${policy.rule}`,
    'language: TypeScript',
    'severity: error',
    `message: '${policy.message.replaceAll("'", "''")}'`,
    'rule:',
    `  pattern: ${policy.astGrepPattern}`,
    serializeAstGrepConstraints(policy.astGrepConstraints),
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildInlineAstGrepRules(policies) {
  return policies.map((policy) => serializeAstGrepRule(policy)).join('\n---\n');
}

export function isAstGrepAuditExcludedPath(relativePath, policies) {
  if (isBrowserAdapterAllowedPath(relativePath) || isBrowserAdapterTestLikeFile(relativePath)) {
    return true;
  }

  return policies.some(
    (policy) => typeof policy.allow === 'function' && policy.allow(relativePath) === true
  );
}
