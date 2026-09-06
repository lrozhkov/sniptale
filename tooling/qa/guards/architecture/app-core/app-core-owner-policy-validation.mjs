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
    value.every((entry) => Array.isArray(entry) && entry.length === 2 && entry.every(validPath)) &&
    new Set(value.map((entry) => `${entry[0]}\0${entry[1]}`)).size === value.length
  );
}

function validAuthorities(value) {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(validPath) &&
    new Set(value).size === value.length
  );
}

export function appCoreOwnerPolicyErrors(policy) {
  return policy?.schemaVersion === 3 &&
    validAuthorities(policy.authorityOwners) &&
    validPathPairs(policy.forbiddenOwnerEdges) &&
    validPathArray(policy.featurePublicEntrypoints, { required: true }) &&
    validPathPairs(policy.sameConcernPersistenceEdges) &&
    validPathArray(policy.forbiddenBroadBarrels)
    ? []
    : ['invalid app-core owner policy'];
}
