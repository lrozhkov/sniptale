import type { VideoRecordingSettings } from '@sniptale/runtime-contracts/video/types/types';
import type { RecordingSidecarRecorder } from '../sidecar/types';
import type {
  FinalizedRecordingStagingArtifact,
  RecordingStagingCoordinator,
} from '../../../composition/persistence/recordings/staging';
import type { RecordingArtifactSession } from '../encoding/artifact-session';

export type MultiSourceRecorder = {
  artifact: FinalizedRecordingStagingArtifact | null;
  artifactSession: RecordingArtifactSession;
  label: string | null;
  recorder: MediaRecorder;
  recordingId: string;
  release?: () => void;
  sourceIndex: number;
  stream: MediaStream;
  trackSettings: MediaTrackSettings;
};

type MultiSourceLifecyclePhase = 'starting' | 'active' | 'terminal';

type MultiSourceLifecycle = {
  readonly phase: MultiSourceLifecyclePhase;
  readonly startPromise: Promise<void>;
  activate(): boolean;
  beginStop(): Exclude<MultiSourceLifecyclePhase, 'terminal'> | null;
  fail(error: Error): boolean;
};

export function createMultiSourceLifecycle(): MultiSourceLifecycle {
  let phase: MultiSourceLifecyclePhase = 'starting';
  let resolveStart!: () => void;
  let rejectStart!: (reason?: unknown) => void;
  const startPromise = new Promise<void>((resolve, reject) => {
    resolveStart = resolve;
    rejectStart = reject;
  });

  return {
    get phase() {
      return phase;
    },
    startPromise,
    activate() {
      if (phase !== 'starting') return false;
      phase = 'active';
      resolveStart();
      return true;
    },
    beginStop() {
      if (phase === 'terminal') return null;
      const previous = phase;
      phase = 'terminal';
      if (previous === 'starting') resolveStart();
      return previous;
    },
    fail(error) {
      if (phase === 'terminal') return false;
      const previous = phase;
      phase = 'terminal';
      if (previous === 'starting') rejectStart(error);
      return true;
    },
  };
}

export type MultiSourceSession = {
  audioRecorder: MultiSourceRecorder | null;
  durationTimer: ReturnType<typeof setInterval> | null;
  lifecycle: MultiSourceLifecycle;
  recorders: MultiSourceRecorder[];
  recordingId: string;
  settings: VideoRecordingSettings;
  staging: RecordingStagingCoordinator;
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
