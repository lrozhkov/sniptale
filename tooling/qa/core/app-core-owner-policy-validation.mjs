const OWNER_CLASSES = new Set(['app-core', 'feature', 'persistence', 'workflow']);

function validPath(value) {
  return (
    typeof value === 'string' && value.length > 0 && !value.startsWith('/') && !value.includes('..')
  );
}

function validPathArray(value, { required = false } = {}) {
  return (
    Array.isArray(value) &&
    (!required || value.length > 0) &&
    value.every(validPath) &&
    new Set(value).size === value.length
  );
}

function validPathPairs(value) {
  return (
    Array.isArray(value) &&
    value.every((entry) => Array.isArray(entry) && entry.length === 2 && entry.every(validPath))
  );
}

function validOwnerRules(value) {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (rule) =>
        validPath(rule?.sourcePrefix) &&
        typeof rule.ownerId === 'string' &&
        rule.ownerId.length > 0 &&
        OWNER_CLASSES.has(rule.ownerClass)
    ) &&
    new Set(value.map((rule) => rule.sourcePrefix)).size === value.length
  );
}

function validAuthorities(value) {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (owner) =>
        typeof owner?.id === 'string' &&
        owner.id.length > 0 &&
        validPath(owner.path) &&
        typeof owner.stateKind === 'string' &&
        owner.stateKind.length > 0
    ) &&
    new Set(value.map((owner) => owner.id)).size === value.length &&
    new Set(value.map((owner) => owner.path)).size === value.length
  );
}

export function appCoreOwnerPolicyErrors(policy) {
  return policy?.schemaVersion === 1 &&
    validOwnerRules(policy.finalOwnerRules) &&
    validAuthorities(policy.authorityOwners) &&
    validPathArray(policy.forbiddenSourcePrefixes) &&
    validPathPairs(policy.forbiddenOwnerEdges) &&
    validPathArray(policy.featurePublicEntrypoints, { required: true }) &&
    validPathPairs(policy.sameConcernPersistenceEdges) &&
    validPathArray(policy.retainedAppUiRoots, { required: true }) &&
    validPathArray(policy.forbiddenBroadBarrels)
    ? []
    : ['invalid app-core owner policy'];
}
