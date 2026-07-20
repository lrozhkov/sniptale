import type { NativeAppRuntimeStatus } from '../../../contracts/native-app/runtime';

interface NativeRecordingStatusContext {
  getHandshakeAccepted(): boolean;
  getStatus(): NativeAppRuntimeStatus;
  ownsLease(message: { controllerLeaseId: string }): boolean;
  setStatus(status: NativeAppRuntimeStatus): void;
  warn(message: string): void;
}

export function updateNativeRecordingStatus(
  ctx: NativeRecordingStatusContext,
  message: { controllerLeaseId: string; recordingId: string },
  status: 'recording' | 'paused' | 'stopping' | 'finalizing',
  durationMs: number
): boolean {
  if (!ctx.getHandshakeAccepted()) {
    ctx.warn('Early status');
    return false;
  }
  if (!ctx.ownsLease(message)) {
    ctx.warn('Stale recording status');
    return false;
  }
  const current = ctx.getStatus();
  const install = current.appStatus?.install ?? current.install;
  if (!install) {
    ctx.warn('Missing install status');
    return true;
  }
  const appStatus = current.appStatus ?? {
    connectedBrowser: true,
    install,
    lastError: null,
    recording: null,
    settingsRevision: current.settingsRevision,
  };
  ctx.setStatus({
    ...current,
    appStatus: {
      ...appStatus,
      recording: { durationMs, recordingId: message.recordingId, status },
    },
  });
  return true;
}
