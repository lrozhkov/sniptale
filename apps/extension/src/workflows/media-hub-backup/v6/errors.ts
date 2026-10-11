type MediaBackupFailurePhase = 'prepare' | 'encode' | 'write' | 'read';
type MediaBackupFailureReason =
  | 'metadata-budget'
  | 'metadata-invalid'
  | 'resource-invalid'
  | 'archive-write';

/** Controlled backup feedback: raw metadata and exception messages never become diagnostics. */
export class MediaBackupFailure extends Error {
  constructor(
    readonly reason: MediaBackupFailureReason,
    readonly phase: MediaBackupFailurePhase,
    readonly metrics: { bytes?: number; limit?: number } = {},
    options?: ErrorOptions,
    readonly resourceRole: 'metadata' | 'favicon' | 'document' = 'metadata'
  ) {
    super(
      reason === 'metadata-budget'
        ? 'Media backup metadata exceeds its byte budget.'
        : 'Media backup validation or transfer failed.',
      options
    );
  }
}

export function backupFailure(error: unknown, phase: MediaBackupFailurePhase): unknown {
  if (
    error instanceof MediaBackupFailure ||
    (error instanceof Error && error.name === 'AbortError')
  )
    return error;
  return new MediaBackupFailure(
    phase === 'write' ? 'archive-write' : 'metadata-invalid',
    phase,
    {},
    { cause: error }
  );
}

export function assertBackupByteBudget(
  bytes: number,
  limit: number,
  phase: MediaBackupFailurePhase,
  resourceRole: MediaBackupFailure['resourceRole'] = 'metadata'
): void {
  if (bytes > limit)
    throw new MediaBackupFailure(
      'metadata-budget',
      phase,
      { bytes, limit },
      undefined,
      resourceRole
    );
}
