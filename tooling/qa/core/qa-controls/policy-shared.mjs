const VALID_DISPOSITIONS = new Set(['adapt', 'keep', 'replace', 'retire']);

export function createViolation(rule, file, message) {
  return { rule, file, message };
}

export function duplicateValues(items, key) {
  const seen = new Set();
  const duplicates = new Set();
  for (const item of items) {
    const value = item?.[key];
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates].sort();
}

export function validateEntryShape(entry, { allowedKeys, key, file, kind }) {
  const violations = [];
  for (const field of [key, 'disposition', 'owner', 'rationale']) {
    if (typeof entry?.[field] !== 'string' || entry[field].trim() === '') {
      violations.push(
        createViolation('qa-control-policy-metadata', file, `${kind} requires ${field}`)
      );
    }
  }
  if (!VALID_DISPOSITIONS.has(entry?.disposition)) {
    violations.push(
      createViolation(
        'qa-control-policy-disposition',
        file,
        `${kind} must use keep, adapt, retire, or replace`
      )
    );
  }
  if (entry?.disposition === 'replace' && !entry.successorId && !entry.successorPath) {
    violations.push(
      createViolation(
        'qa-control-policy-successor',
        file,
        `${kind} replacement requires a successor`
      )
    );
  }
  if (entry?.disposition === 'retire' && entry.successorId) {
    violations.push(
      createViolation(
        'qa-control-policy-retirement',
        file,
        `${kind} retirement cannot name a live successor ID`
      )
    );
  }
  const unknownKeys = Object.keys(entry ?? {}).filter((field) => !allowedKeys.includes(field));
  if (unknownKeys.length > 0) {
    violations.push(
      createViolation(
        'qa-control-policy-unknown-key',
        file,
        `${kind} has unknown keys: ${unknownKeys.sort().join(', ')}`
      )
    );
  }
  return violations;
}

export function validateExactPopulation(actual, declared, file, missingRule, staleRule) {
  const actualSet = new Set(actual);
  const declaredSet = new Set(declared);
  return [
    ...[...actualSet]
      .filter((value) => !declaredSet.has(value))
      .map((value) => createViolation(missingRule, file, `${value} has no disposition`)),
    ...[...declaredSet]
      .filter((value) => !actualSet.has(value))
      .map((value) =>
        createViolation(staleRule, file, `${value} is stale or no longer discovered`)
      ),
  ];
}
