const STEP_STATUSES = new Set(['blocked', 'failed', 'ok', 'skipped']);

export function assertRecord(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value;
}

export function assertStringArray(value, label) {
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === 'string')) {
    throw new Error(`${label} must be a string array.`);
  }
  return value;
}

export function assertArray(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  return value;
}

export function assertPositiveInteger(value, label) {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return value;
}

function assertExactKeys(value, expectedKeys, label) {
  const actualKeys = Object.keys(value).sort();
  const sortedExpectedKeys = [...expectedKeys].sort();
  if (JSON.stringify(actualKeys) !== JSON.stringify(sortedExpectedKeys)) {
    throw new Error(`${label} has an invalid field population.`);
  }
}

function parseWorkerError(value, fallbackMessage) {
  const serialized = assertRecord(value, 'QA worker error');
  assertExactKeys(serialized, ['message', 'name', 'stack'], 'QA worker error');
  if (
    typeof serialized.message !== 'string' ||
    typeof serialized.name !== 'string' ||
    typeof serialized.stack !== 'string'
  ) {
    throw new Error('QA worker error fields must be strings.');
  }
  const error = new Error(serialized.message || fallbackMessage);
  error.name = serialized.name || 'Error';
  if (serialized.stack) error.stack = serialized.stack;
  return error;
}

function parseJsonValue(value, label) {
  if (value == null || ['boolean', 'number', 'string'].includes(typeof value)) return value;
  if (Array.isArray(value)) {
    return value.map((entry, index) => parseJsonValue(entry, `${label}[${index}]`));
  }
  const record = assertRecord(value, label);
  return Object.fromEntries(
    Object.entries(record).map(([key, entry]) => [key, parseJsonValue(entry, `${label}.${key}`)])
  );
}

export function parseQaWorkerEnvelope(value, fallbackMessage) {
  const envelope = assertRecord(value, 'QA worker result envelope');
  if (envelope.ok === true) {
    assertExactKeys(envelope, ['ok', 'value'], 'QA worker success envelope');
    return { ok: true, value: envelope.value };
  }
  if (envelope.ok === false) {
    assertExactKeys(envelope, ['error', 'ok'], 'QA worker failure envelope');
    return { ok: false, error: parseWorkerError(envelope.error, fallbackMessage) };
  }
  throw new Error('QA worker result envelope requires a boolean ok field.');
}

export function parseQaStep(value, label) {
  const step = assertRecord(value, label);
  if (typeof step.label !== 'string' || !STEP_STATUSES.has(step.status)) {
    throw new Error(`${label} requires a label and supported status.`);
  }
  const parsed = { label: step.label, status: step.status };
  for (const field of [
    'advice',
    'consoleOutput',
    'detail',
    'header',
    'stderr',
    'stdout',
    'summary',
    'typecheckMode',
  ]) {
    if (step[field] != null && typeof step[field] !== 'string') {
      throw new Error(`${label}.${field} must be a string when present.`);
    }
    if (step[field] != null) parsed[field] = step[field];
  }
  if (
    step.durationMs != null &&
    (typeof step.durationMs !== 'number' ||
      !Number.isFinite(step.durationMs) ||
      step.durationMs < 0)
  ) {
    throw new Error(`${label}.durationMs must be a non-negative finite number when present.`);
  }
  if (step.durationMs != null) parsed.durationMs = step.durationMs;
  if (step.exitCode != null) {
    if (!Number.isInteger(step.exitCode) || step.exitCode < 0) {
      throw new Error(`${label}.exitCode must be a non-negative integer when present.`);
    }
    parsed.exitCode = step.exitCode;
  }
  if (step.checkedProjectIds != null) {
    parsed.checkedProjectIds = [
      ...assertStringArray(step.checkedProjectIds, `${label}.checkedProjectIds`),
    ];
  }
  if (step.failures != null) {
    parsed.failures = [...assertStringArray(step.failures, `${label}.failures`)];
  }
  for (const field of ['advisories', 'violations']) {
    if (step[field] == null) continue;
    if (!Array.isArray(step[field])) throw new Error(`${label}.${field} must be an array.`);
    parsed[field] = step[field].map((entry, index) =>
      parseJsonValue(entry, `${label}.${field}[${index}]`)
    );
  }
  if (
    step.status !== 'failed' &&
    ((parsed.failures?.length ?? 0) > 0 ||
      (parsed.violations?.length ?? 0) > 0 ||
      (parsed.exitCode ?? 0) !== 0)
  ) {
    throw new Error(`${label} has failure evidence with non-failed status.`);
  }
  return parsed;
}

export function parseLaneResult(value, { lane, shapes }) {
  const result = assertRecord(value, `${lane} lane result`);
  const shape = shapes[lane];
  if (!shape) throw new Error(`Unknown QA lane result shape: ${lane}`);
  assertExactKeys(result, Object.keys(shape), `${lane} lane result`);
  const parsed = {};
  for (const [field, kind] of Object.entries(shape)) {
    const fieldValue = result[field];
    if (kind === 'step') parsed[field] = parseQaStep(fieldValue, `${lane}.${field}`);
    else if (kind === 'nullable-step') {
      parsed[field] = fieldValue == null ? null : parseQaStep(fieldValue, `${lane}.${field}`);
    } else if (kind === 'steps') {
      if (!Array.isArray(fieldValue)) throw new Error(`${lane}.${field} must be a step array.`);
      parsed[field] = fieldValue.map((step, index) =>
        parseQaStep(step, `${lane}.${field}[${index}]`)
      );
    } else {
      throw new Error(`Unsupported QA lane result field kind: ${kind}`);
    }
  }
  return parsed;
}

export function parseLaneWorkerInput(
  value,
  {
    contextBooleanFields = [],
    contextFields = [],
    contextStringArrayFields = [],
    extraFields = [],
    label,
    lanes,
  }
) {
  const input = assertRecord(value, `${label} input`);
  assertExactKeys(input, ['context', 'lane', 'vitestMaxWorkers', ...extraFields], `${label} input`);
  if (typeof input.lane !== 'string' || !lanes.includes(input.lane)) {
    throw new Error(`${label} has an unsupported lane.`);
  }
  assertPositiveInteger(input.vitestMaxWorkers, `${label}.vitestMaxWorkers`);
  const context = assertRecord(input.context, `${label}.context`);
  assertExactKeys(context, contextFields, `${label}.context`);
  for (const field of contextStringArrayFields) {
    assertStringArray(context[field], `${label}.context.${field}`);
  }
  for (const field of contextBooleanFields) {
    if (typeof context[field] !== 'boolean') {
      throw new Error(`${label}.context.${field} must be a boolean.`);
    }
  }
  return input;
}
