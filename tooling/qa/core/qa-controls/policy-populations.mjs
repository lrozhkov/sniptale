import {
  createViolation,
  duplicateValues,
  validateEntryShape,
  validateExactPopulation,
} from './policy-shared.mjs';

function duplicateViolations(rows, key, rule, file, label) {
  return duplicateValues(rows, key).map((value) =>
    createViolation(rule, file, `duplicate ${label} ${value}`)
  );
}

export function validatePolicyRows(discovery, policy, file) {
  const rows = policy.policyFiles ?? [];
  const byPath = new Map(rows.map((row) => [row.path, row]));
  const violations = rows.flatMap((row) =>
    validateEntryShape(row, {
      allowedKeys: ['consumers', 'disposition', 'owner', 'path', 'rationale', 'successorPath'],
      key: 'path',
      file,
      kind: `policy ${row?.path ?? '<unknown>'}`,
    })
  );
  violations.push(
    ...duplicateViolations(rows, 'path', 'qa-policy-file-duplicate', file, 'policy'),
    ...validateExactPopulation(
      discovery.policyFiles.map(({ path }) => path),
      rows.map(({ path }) => path),
      file,
      'qa-policy-file-unclassified',
      'qa-policy-file-stale'
    )
  );
  for (const policyFile of discovery.policyFiles) {
    const row = byPath.get(policyFile.path);
    if (
      row &&
      (!Array.isArray(row.consumers) ||
        row.consumers.length !== policyFile.consumers.length ||
        row.consumers.some((consumer, index) => consumer !== policyFile.consumers[index]))
    ) {
      violations.push(
        createViolation(
          'qa-policy-file-consumer-drift',
          policyFile.path,
          'declared consumers must exactly match the sorted discovered consumer set'
        )
      );
    }
    if (row && row.disposition !== 'retire' && policyFile.consumers.length === 0) {
      violations.push(
        createViolation(
          'qa-policy-file-no-consumer',
          policyFile.path,
          'active policy has no discovered production consumer; retire it or declare the consumer'
        )
      );
    }
  }
  return violations;
}

function isOrphanExecutable(executable, row) {
  return (
    row &&
    row.disposition !== 'retire' &&
    executable.controlIds.length === 0 &&
    executable.scriptIds.length === 0 &&
    executable.proofFiles.length === 0 &&
    !row.proofReason
  );
}

export function validateExecutableRows(discovery, policy, file) {
  const rows = policy.executables ?? [];
  const byPath = new Map(rows.map((row) => [row.path, row]));
  const violations = rows.flatMap((row) =>
    validateEntryShape(row, {
      allowedKeys: ['disposition', 'owner', 'path', 'proofReason', 'rationale', 'successorPath'],
      key: 'path',
      file,
      kind: `executable ${row?.path ?? '<unknown>'}`,
    })
  );
  violations.push(
    ...duplicateViolations(rows, 'path', 'qa-executable-policy-duplicate', file, 'executable'),
    ...validateExactPopulation(
      discovery.executables.map(({ path }) => path),
      rows.map(({ path }) => path),
      file,
      'qa-executable-policy-unclassified',
      'qa-executable-policy-stale'
    ),
    ...discovery.executables
      .filter((entry) => isOrphanExecutable(entry, byPath.get(entry.path)))
      .map((entry) =>
        createViolation(
          'qa-executable-policy-orphan',
          entry.path,
          'executable needs a canonical control, QA script, committed proof, or explicit orchestration proof reason'
        )
      )
  );
  return violations;
}

export function validateScriptRows(discovery, policy, file) {
  const rows = policy.scripts ?? [];
  const violations = rows.flatMap((row) =>
    validateEntryShape(row, {
      allowedKeys: ['disposition', 'id', 'owner', 'rationale', 'successorId'],
      key: 'id',
      file,
      kind: `QA script ${row?.id ?? '<unknown>'}`,
    })
  );
  return [
    ...violations,
    ...duplicateViolations(rows, 'id', 'qa-script-policy-duplicate', file, 'QA script'),
    ...validateExactPopulation(
      discovery.packageQaScripts.map(({ id }) => id),
      rows.map(({ id }) => id),
      file,
      'qa-script-policy-unclassified',
      'qa-script-policy-stale'
    ),
  ];
}

export function validateValidationRows(discovery, policy, file) {
  const rows = policy.validationTools ?? [];
  const violations = rows.flatMap((row) =>
    validateEntryShape(row, {
      allowedKeys: ['disposition', 'owner', 'rationale', 'successorId', 'tool'],
      key: 'tool',
      file,
      kind: `validation tool ${row?.tool ?? '<unknown>'}`,
    })
  );
  return [
    ...violations,
    ...duplicateViolations(rows, 'tool', 'qa-validation-policy-duplicate', file, 'validation tool'),
    ...validateExactPopulation(
      discovery.validationTools,
      rows.map(({ tool }) => tool),
      file,
      'qa-validation-policy-unclassified',
      'qa-validation-policy-stale'
    ),
    ...(discovery.validationDuplicates ?? []).map((tool) =>
      createViolation(
        'qa-validation-manifest-duplicate',
        'tooling/configs/qa/validation-manifest.json',
        `validation manifest contains duplicate tool ${tool}`
      )
    ),
  ];
}
