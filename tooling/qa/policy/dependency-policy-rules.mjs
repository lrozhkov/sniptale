import { readRepositoryJson } from './repository-contained-paths.mjs';
import { evaluateSpdxExpression } from './spdx-expression.mjs';

export const DEPENDENCY_POLICY_RULES_PATH = 'tooling/configs/qa/dependency-policy-rules.data.json';

function sameStrings(left, right) {
  return JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
}

function activeDate(value) {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/u.test(value) &&
    value >= new Date().toISOString().slice(0, 10)
  );
}

function exactDependencyFields(entry) {
  return [
    'packageName',
    'resolvedVersion',
    'dependencyScope',
    'artifactInclusion',
    'reason',
    'approvalOwner',
  ].every((key) => typeof entry?.[key] === 'string' && entry[key]);
}

function validSourceException(entry) {
  return (
    exactDependencyFields(entry) &&
    typeof entry.sourceUrl === 'string' &&
    entry.sourceUrl.startsWith('https://') &&
    activeDate(entry.expiresOn)
  );
}

function validInstallApproval(entry) {
  return exactDependencyFields(entry) && activeDate(entry.expiresOn);
}

function validLifecycleApproval(entry) {
  return (
    entry &&
    ['scriptName', 'command', 'ownerId', 'reason', 'approvalOwner'].every(
      (key) => typeof entry[key] === 'string' && entry[key]
    ) &&
    activeDate(entry.expiresOn)
  );
}

function exactDependencyMatch(row, entry) {
  return ['packageName', 'resolvedVersion', 'dependencyScope', 'artifactInclusion'].every(
    (key) => row[key] === entry[key]
  );
}

export function dependencyPolicyRuleErrors(rules) {
  if (
    rules?.schemaVersion !== 1 ||
    !sameStrings(rules.allowedProtocols ?? [], ['https']) ||
    !Array.isArray(rules.allowedRegistryHosts) ||
    rules.allowedRegistryHosts.some((host) => typeof host !== 'string' || !host) ||
    !Array.isArray(rules.sourceExceptions) ||
    rules.sourceExceptions.some((entry) => !validSourceException(entry)) ||
    !Array.isArray(rules.installScriptApprovals) ||
    rules.installScriptApprovals.some((entry) => !validInstallApproval(entry)) ||
    !Array.isArray(rules.rootLifecycleApprovals) ||
    rules.rootLifecycleApprovals.some((entry) => !validLifecycleApproval(entry)) ||
    typeof rules.licensePolicyPath !== 'string' ||
    !rules.licensePolicyPath ||
    rules.workspaceIdentity !== 'root:sniptale'
  )
    return ['invalid dependency policy rules'];
  return [];
}

export function dependencyPolicyRules(root = process.cwd()) {
  const rules = readRepositoryJson(root, DEPENDENCY_POLICY_RULES_PATH);
  const errors = dependencyPolicyRuleErrors(rules);
  if (errors.length) throw new Error(errors.join('; '));
  return rules;
}

export function admittedDependencySource(row, rules) {
  let url;
  try {
    url = new URL(row.sourceUrl);
  } catch {
    return null;
  }
  if (url.protocol.replace(/:$/u, '') !== row.sourceProtocol) return null;
  if (
    rules.allowedProtocols.includes(row.sourceProtocol) &&
    rules.allowedRegistryHosts.includes(url.host)
  )
    return 'registry-allowlist';
  const exception = rules.sourceExceptions.find(
    (entry) => exactDependencyMatch(row, entry) && entry.sourceUrl === row.sourceUrl
  );
  return exception ? 'exact-source-exception' : null;
}

export function admittedInstallScript(row, rules) {
  if (!row.hasInstallScript) return 'not-applicable';
  return rules.installScriptApprovals.some((entry) => exactDependencyMatch(row, entry))
    ? 'approved-install-script'
    : null;
}

export function rootLifecyclePolicyStatus(row, rules) {
  return rules.rootLifecycleApprovals.some(
    (entry) =>
      entry.scriptName === row.scriptName &&
      entry.command === row.command &&
      entry.ownerId === row.ownerId
  )
    ? 'approved-root-lifecycle'
    : null;
}

function validLicenseException(entry) {
  return (
    exactDependencyFields(entry) &&
    typeof entry.licenseExpression === 'string' &&
    entry.licenseExpression &&
    activeDate(entry.expiresOn)
  );
}

/** Evaluate the complete SPDX expression, then allow only an active exact reviewed exception. */
export function dependencyLicensePolicyStatus(row, policy) {
  if (!Array.isArray(policy?.deniedLicenses) || !Array.isArray(policy?.reviewedExceptions))
    return null;
  const evaluation = evaluateSpdxExpression(row.licenseExpression, policy.deniedLicenses);
  if (!evaluation) return null;
  if (evaluation.allowed) return 'approved';
  const exception = policy.reviewedExceptions.find(
    (entry) =>
      validLicenseException(entry) &&
      exactDependencyMatch(row, entry) &&
      entry.licenseExpression === row.licenseExpression
  );
  return exception ? 'reviewed-exception' : null;
}
