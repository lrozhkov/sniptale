import type { RecordingFrameClockBinding } from '../../../contracts/video/recording-frame-clock';

/** Confirms successful local startup cleanup for one exact source binding. */
export class RecordingStartCleanupConfirmedError extends Error {
  readonly binding: RecordingFrameClockBinding;

  constructor(cause: unknown, binding: RecordingFrameClockBinding) {
    super(cause instanceof Error ? cause.message : String(cause), { cause });
    this.binding = { ...binding };
  }
}

const reportedRecordingStartErrors = new WeakSet<object>();
const REPORTED_RECORDING_START_ERROR = Symbol('reportedRecordingStartError');

type ReportedPrimitiveRecordingStartError = {
  readonly [REPORTED_RECORDING_START_ERROR]: true;
  readonly error: unknown;
};

function isReportedPrimitiveRecordingStartError(
  error: unknown
): error is ReportedPrimitiveRecordingStartError {
  return (
    typeof error === 'object' &&
    error !== null &&
    REPORTED_RECORDING_START_ERROR in error &&
    error[REPORTED_RECORDING_START_ERROR] === true
  );
}

export function markRecordingStartErrorReported(error: unknown): unknown {
  if (typeof error === 'object' && error !== null) {
    reportedRecordingStartErrors.add(error);
    return error;
  }

  return {
    [REPORTED_RECORDING_START_ERROR]: true,
    error,
  } satisfies ReportedPrimitiveRecordingStartError;
}

export function isRecordingStartErrorReported(error: unknown): boolean {
  return (
    isReportedPrimitiveRecordingStartError(error) ||
    (typeof error === 'object' && error !== null && reportedRecordingStartErrors.has(error))
  );
}

export function unwrapRecordingStartReportedError(error: unknown): unknown {
  return isReportedPrimitiveRecordingStartError(error) ? error.error : error;
}
