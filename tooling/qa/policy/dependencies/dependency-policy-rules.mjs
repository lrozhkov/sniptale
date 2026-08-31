import { readRepositoryJson } from '../paths/repository-contained-paths.mjs';
import { evaluateSpdxExpression } from '../legal/spdx-expression.mjs';

export const DEPENDENCY_POLICY_RULES_PATH = 'tooling/configs/qa/dependency-policy-rules.data.json';

function sameStrings(left, right) {
  return JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
}

const DEPENDENCY_SCOPES = new Set([
  'direct-development',
  'direct-runtime',
  'transitive-development',
  'transitive-runtime',
]);
const ARTIFACT_INCLUSIONS = new Set(['development-only', 'source-runtime-candidate']);

function hasExactKeys(entry, keys) {
  return (
    entry != null &&
    typeof entry === 'object' &&
    !Array.isArray(entry) &&
    sameStrings(Object.keys(entry), keys)
  );
}

function activeDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.valueOf()) &&
    parsed.toISOString().slice(0, 10) === value &&
    value >= new Date().toISOString().slice(0, 10)
  );
}

function exactDependencyFields(entry) {
  return (
    [
      'packageName',
      'resolvedVersion',
      'dependencyScope',
      'artifactInclusion',
      'reason',
      'approvalOwner',
    ].every((key) => typeof entry?.[key] === 'string' && entry[key]) &&
    DEPENDENCY_SCOPES.has(entry.dependencyScope) &&
    ARTIFACT_INCLUSIONS.has(entry.artifactInclusion)
  );
}

function validSourceException(entry) {
  return (
    hasExactKeys(entry, [
      'packageName',
      'resolvedVersion',
      'dependencyScope',
      'artifactInclusion',
      'sourceUrl',
      'reason',
      'approvalOwner',
      'expiresOn',
    ]) &&
    exactDependencyFields(entry) &&
    typeof entry.sourceUrl === 'string' &&
    entry.sourceUrl.startsWith('https://') &&
    activeDate(entry.expiresOn)
  );
}

function validInstallApproval(entry) {
  return (
    hasExactKeys(entry, [
      'packageName',
      'resolvedVersion',
      'dependencyScope',
      'artifactInclusion',
      'reason',
      'approvalOwner',
      'expiresOn',
    ]) &&
    exactDependencyFields(entry) &&
    activeDate(entry.expiresOn)
  );
}

function validLifecycleApproval(entry) {
  return (
    hasExactKeys(entry, [
      'scriptName',
      'command',
      'ownerId',
      'reason',
      'approvalOwner',
      'expiresOn',
    ]) &&
    entry &&
    ['scriptName', 'command', 'ownerId', 'reason', 'approvalOwner'].every(
      (key) => typeof entry[key] === 'string' && entry[key]
    ) &&
    activeDate(entry.expiresOn)
  );
}

function hasDuplicateIdentities(entries, keys) {
  const identities = entries.map((entry) => keys.map((key) => entry?.[key]).join('\0'));
  return new Set(identities).size !== identities.length;
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
    rules.allowedRegistryHosts.some(
      (host) => typeof host !== 'string' || !/^[a-z0-9.-]+$/u.test(host)
    ) ||
    new Set(rules.allowedRegistryHosts).size !== rules.allowedRegistryHosts.length ||
    !Array.isArray(rules.sourceExceptions) ||
    rules.sourceExceptions.some((entry) => !validSourceException(entry)) ||
    hasDuplicateIdentities(rules.sourceExceptions, [
      'packageName',
      'resolvedVersion',
      'dependencyScope',
      'artifactInclusion',
      'sourceUrl',
    ]) ||
    !Array.isArray(rules.installScriptApprovals) ||
    rules.installScriptApprovals.some((entry) => !validInstallApproval(entry)) ||
    hasDuplicateIdentities(rules.installScriptApprovals, [
      'packageName',
      'resolvedVersion',
      'dependencyScope',
      'artifactInclusion',
    ]) ||
    !Array.isArray(rules.rootLifecycleApprovals) ||
    rules.rootLifecycleApprovals.some((entry) => !validLifecycleApproval(entry)) ||
    hasDuplicateIdentities(rules.rootLifecycleApprovals, ['scriptName', 'command', 'ownerId']) ||
    !hasExactKeys(rules, [
      'schemaVersion',
      'allowedProtocols',
      'allowedRegistryHosts',
      'sourceExceptions',
      'installScriptApprovals',
      'rootLifecycleApprovals',
    ])
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
