import { videoManagerSession } from '../manager/session';

export function setVideoRecordingCountdownSessionId(sessionId: string | null): void {
  videoManagerSession.currentCountdownSessionId = sessionId;
}

export function setVideoRecordingId(recordingId: string | null): void {
  videoManagerSession.currentRecordingId = recordingId;
}

export function setVideoRecordingTabId(tabId: number | null): void {
  videoManagerSession.recordingTabId = tabId;
}
