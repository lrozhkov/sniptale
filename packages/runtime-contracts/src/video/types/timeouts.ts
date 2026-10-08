export const RECORDING_START_DELIVERY_TIMEOUT_MS = 10_000;
export const OFFSCREEN_RECORDING_START_TIMEOUT_MS = 15_000;
export const RECORDING_START_ACTIVATION_TIMEOUT_MS = 20_000;

/** Recording callers allow cold offscreen listener installation independently of data admission. */
export const RECORDING_OFFSCREEN_READY_TIMEOUT_MS = 30_000;
/** Admission precedes stream, metadata and audio setup; the source deadline covers their sum. */
export const RECORDING_SOURCE_PREPARATION_TIMEOUT_MS =
  OFFSCREEN_RECORDING_START_TIMEOUT_MS + 30_000;
