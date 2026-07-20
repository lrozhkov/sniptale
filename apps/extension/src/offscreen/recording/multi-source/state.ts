import type { VideoRecordingSettings } from '@sniptale/runtime-contracts/video/types/types';
import type { RecordingSidecarRecorder } from '../sidecar/types';

export type MultiSourceRecorder = {
  chunks: Blob[];
  label: string | null;
  recorder: MediaRecorder;
  recordingId: string;
  release?: () => void;
  sourceIndex: number;
  stream: MediaStream;
  trackSettings: MediaTrackSettings;
};

export type MultiSourceSession = {
  audioRecorder: MultiSourceRecorder | null;
  durationTimer: ReturnType<typeof setInterval> | null;
  recorders: MultiSourceRecorder[];
  recordingId: string;
  settings: VideoRecordingSettings;
  startedAt: number;
  stopReject: ((reason?: unknown) => void) | null;
  stopPromise: Promise<void> | null;
  stopResolve: (() => void) | null;
  webcamRecorder: RecordingSidecarRecorder | null;
};

let activeSession: MultiSourceSession | null = null;

export function getActiveMultiSourceSession(): MultiSourceSession | null {
  return activeSession;
}

export function setActiveMultiSourceSession(session: MultiSourceSession | null): void {
  activeSession = session;
}
