import type { createLogger } from '@sniptale/platform/observability/logger';

// policyStateId: video-recording-control-lease - replay cache mirrors one recording lifecycle.
const TERMINAL_RECORDING_ID_LIMIT = 128;
const terminalRecordingIds = new Set<string>();
const finalizingRecordingIds = new Set<string>();

type Logger = ReturnType<typeof createLogger>;

function rememberTerminalRecordingId(recordingId: string): void {
  terminalRecordingIds.add(recordingId);
  if (terminalRecordingIds.size <= TERMINAL_RECORDING_ID_LIMIT) {
    return;
  }

  const oldestRecordingId = terminalRecordingIds.values().next().value;
  if (typeof oldestRecordingId === 'string') {
    terminalRecordingIds.delete(oldestRecordingId);
  }
}

export function beginRecordingFinalization(recordingId: string, logger: Logger): boolean {
  if (terminalRecordingIds.has(recordingId) || finalizingRecordingIds.has(recordingId)) {
    logger.warn('Ignoring duplicate recording finalization', { recordingId });
    return false;
  }

  finalizingRecordingIds.add(recordingId);
  return true;
}

export function finishRecordingFinalization(recordingId: string, terminal: boolean): void {
  finalizingRecordingIds.delete(recordingId);
  if (terminal) {
    rememberTerminalRecordingId(recordingId);
  }
}
