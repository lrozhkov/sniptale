import {
  createViolation,
  duplicateValues,
  validateEntryShape,
  validateExactPopulation,
} from './policy-shared.mjs';

const VALID_SOURCE_KINDS = new Set(['external', 'repository']);
const CONTROL_KEYS = [
  'disposition',
  'id',
  'owner',
  'proofReason',
  'rationale',
  'sourceKind',
  'successorId',
];

function isRepositorySource(source) {
  return typeof source === 'string' && source.startsWith('tooling/') && !source.endsWith('/git');
}

function validateRuntimeMetadata(control) {
  return ['owner', 'ruleDoc', 'remediation', 'truthSource']
    .filter((field) => typeof control[field] !== 'string' || control[field].trim() === '')
    .map((field) =>
      createViolation('qa-control-runtime-metadata', control.source, `${control.id} lacks ${field}`)
    );
}

function validateMetricRemediation(control) {
  if (control.owner !== 'maintainability-governance') return [];
  const required = [
    [/owner boundary/iu, 'must direct the operator to inspect the owner boundary'],
    [/do not mechanically split/iu, 'must reject mechanical metric-only splitting'],
  ];
  return required
    .filter(([pattern]) => !pattern.test(control.remediation))
    .map(([, message]) =>
      createViolation('qa-control-metric-remediation', control.source, `${control.id} ${message}`)
    );
}

function validateControl(control, row, file) {
  if (!row) return [];
  const violations = [];
  if (!VALID_SOURCE_KINDS.has(row.sourceKind)) {
    violations.push(
      createViolation('qa-control-policy-source-kind', file, `${control.id} requires sourceKind`)
    );
  }
  if (
    row.sourceKind === 'repository' &&
    isRepositorySource(control.source) &&
    control.sourceExists !== true
  ) {
    violations.push(
      createViolation('qa-control-policy-source', file, `${control.id} source is missing`)
    );
  }
  if (row.disposition !== 'retire' && control.proofFiles.length === 0 && !row.proofReason) {
    violations.push(
      createViolation(
        'qa-control-policy-proof',
        file,
        `${control.id} needs committed proof or an explicit proofReason`
      )
    );
  }
  return [
    ...violations,
    ...validateRuntimeMetadata(control),
    ...validateMetricRemediation(control),
  ];
}

export function validateControlRows(discovery, policy, file) {
  const rows = policy.controls ?? [];
  const byId = new Map(rows.map((row) => [row.id, row]));
  const violations = rows.flatMap((row) =>
    validateEntryShape(row, {
      allowedKeys: CONTROL_KEYS,
      key: 'id',
      file,
      kind: `control ${row?.id ?? '<unknown>'}`,
    })
  );
  violations.push(
    ...duplicateValues(rows, 'id').map((id) =>
      createViolation('qa-control-policy-duplicate', file, `duplicate control ${id}`)
    ),
    ...validateExactPopulation(
      discovery.controls.map(({ id }) => id),
      rows.map(({ id }) => id),
      file,
      'qa-control-policy-unclassified',
      'qa-control-policy-stale'
    ),
    ...discovery.controls.flatMap((control) => validateControl(control, byId.get(control.id), file))
  );
  return violations;
}
