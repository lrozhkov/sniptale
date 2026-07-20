export type CaptureJobState =
  | 'created'
  | 'capturing'
  | 'rendering'
  | 'exporting'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type CaptureJobRecord = {
  downloadId?: number | undefined;
  error?: string | undefined;
  jobId: string;
  offscreenGeneration?: string | undefined;
  revision: number;
  runtimeGeneration?: string | undefined;
  state: CaptureJobState;
  tabId: number;
  terminalAtEpochMs?: number | undefined;
  updatedAtEpochMs: number;
};

type CaptureJobRecordFields = {
  downloadId: unknown;
  error: unknown;
  jobId: unknown;
  offscreenGeneration: unknown;
  revision: unknown;
  runtimeGeneration: unknown;
  state: unknown;
  tabId: unknown;
  terminalAtEpochMs: unknown;
  updatedAtEpochMs: unknown;
};

type ValidCaptureJobRecordFields = {
  downloadId: number | undefined;
  error: string | undefined;
  jobId: string;
  offscreenGeneration: string | undefined;
  revision: number;
  runtimeGeneration: string | undefined;
  state: CaptureJobState;
  tabId: number;
  terminalAtEpochMs: number | undefined;
  updatedAtEpochMs: number;
};

const CAPTURE_JOB_STATES = new Set<CaptureJobState>([
  'created',
  'capturing',
  'rendering',
  'exporting',
  'completed',
  'failed',
  'cancelled',
]);

function isTerminalState(state: CaptureJobState): boolean {
  return state === 'completed' || state === 'failed' || state === 'cancelled';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

function isOptionalNonNegativeInteger(value: unknown): value is number | undefined {
  return value === undefined || (Number.isInteger(value) && Number(value) >= 0);
}

function readCaptureJobRecordFields(value: Record<string, unknown>): CaptureJobRecordFields {
  return {
    downloadId: value['downloadId'],
    error: value['error'],
    jobId: value['jobId'],
    offscreenGeneration: value['offscreenGeneration'],
    revision: value['revision'],
    runtimeGeneration: value['runtimeGeneration'],
    state: value['state'],
    tabId: value['tabId'],
    terminalAtEpochMs: value['terminalAtEpochMs'],
    updatedAtEpochMs: value['updatedAtEpochMs'],
  };
}

function hasValidCaptureJobFieldTypes(
  fields: CaptureJobRecordFields
): fields is ValidCaptureJobRecordFields {
  return (
    typeof fields.jobId === 'string' &&
    typeof fields.state === 'string' &&
    CAPTURE_JOB_STATES.has(fields.state as CaptureJobState) &&
    typeof fields.revision === 'number' &&
    Number.isInteger(fields.revision) &&
    fields.revision >= 0 &&
    typeof fields.tabId === 'number' &&
    Number.isInteger(fields.tabId) &&
    fields.tabId >= 0 &&
    isFiniteNumber(fields.updatedAtEpochMs) &&
    isOptionalNonNegativeInteger(fields.downloadId) &&
    isOptionalString(fields.error) &&
    isOptionalString(fields.offscreenGeneration) &&
    isOptionalString(fields.runtimeGeneration) &&
    isOptionalNonNegativeInteger(fields.terminalAtEpochMs)
  );
}

function validateCaptureJobRecordFields(
  fields: CaptureJobRecordFields,
  expectedJobId: string | undefined
): ValidCaptureJobRecordFields | null {
  if (!hasValidCaptureJobFieldTypes(fields)) {
    return null;
  }
  if (expectedJobId !== undefined && fields.jobId !== expectedJobId) {
    return null;
  }
  if (isTerminalState(fields.state) && fields.terminalAtEpochMs === undefined) {
    return null;
  }
  return fields;
}

function createCaptureJobRecord(fields: ValidCaptureJobRecordFields): CaptureJobRecord {
  return {
    ...(fields.downloadId === undefined ? {} : { downloadId: fields.downloadId }),
    ...(fields.error === undefined ? {} : { error: fields.error }),
    jobId: fields.jobId,
    ...(fields.offscreenGeneration === undefined
      ? {}
      : { offscreenGeneration: fields.offscreenGeneration }),
    revision: fields.revision,
    ...(fields.runtimeGeneration === undefined
      ? {}
      : { runtimeGeneration: fields.runtimeGeneration }),
    state: fields.state,
    tabId: fields.tabId,
    ...(fields.terminalAtEpochMs === undefined
      ? {}
      : { terminalAtEpochMs: fields.terminalAtEpochMs }),
    updatedAtEpochMs: fields.updatedAtEpochMs,
  };
}

export function parseCaptureJobRecord(
  value: unknown,
  expectedJobId?: string
): CaptureJobRecord | null {
  if (!isRecord(value)) {
    return null;
  }

  const fields = validateCaptureJobRecordFields(readCaptureJobRecordFields(value), expectedJobId);
  return fields ? createCaptureJobRecord(fields) : null;
}
