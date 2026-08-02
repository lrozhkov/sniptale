import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import type { MultiSourceRecorder, MultiSourceSession } from './state';
import { createMultiSourceLifecycle } from './state';
import { pauseSessionRecorders, resumeSessionRecorders, setSessionMediaEnabled } from './controls';

function createRecorder(
  params: {
    audio?: boolean;
    state?: RecordingState;
  } = {}
): MultiSourceRecorder {
  const pause = vi.fn();
  const resume = vi.fn();
  const recorder = {
    pause,
    resume,
    state: params.state ?? 'recording',
  } as unknown as MediaRecorder;
  const audioTrack = { enabled: true } as MediaStreamTrack;
  const videoTrack = { enabled: true } as MediaStreamTrack;
  return {
    artifact: null,
    artifactSession: {
      abort: vi.fn(),
      recorder,
      setLifecycleCallbacks: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    },
    label: null,
    recorder,
    recordingId: params.audio ? 'rec-mic' : 'rec-window-1',
    sourceIndex: params.audio ? 999 : 0,
    stream: {
      getAudioTracks: () => (params.audio ? [audioTrack] : []),
      getTracks: () => [params.audio ? audioTrack : videoTrack],
      getVideoTracks: () => (params.audio ? [] : [videoTrack]),
    } as unknown as MediaStream,
    trackSettings: params.audio ? {} : { height: 720, width: 1280 },
  };
}

function createSession(): MultiSourceSession {
  return {
    audioRecorder: createRecorder({ audio: true }),
    durationTimer: null,
    lifecycle: createMultiSourceLifecycle(),
    recorders: [createRecorder()],
    recordingId: 'rec',
    settings: DEFAULT_VIDEO_SETTINGS,
    staging: {
      abort: vi.fn(),
      delete: vi.fn(),
      getPendingBytes: vi.fn(() => 0),
      openArtifact: vi.fn(),
    },
    startedAt: Date.now(),
    stopPromise: null,
    stopReject: null,
    stopResolve: null,
    webcamRecorder: null,
  };
}

describe('multi-source recorder controls', () => {
  it('pauses and resumes active video and microphone recorders', () => {
    const session = createSession();
    pauseSessionRecorders(session);
    expect(session.recorders[0]?.recorder.pause).toHaveBeenCalledOnce();
    expect(session.audioRecorder?.recorder.pause).toHaveBeenCalledOnce();

    Object.defineProperty(session.recorders[0]?.recorder, 'state', { value: 'paused' });
    Object.defineProperty(session.audioRecorder?.recorder, 'state', { value: 'paused' });
    resumeSessionRecorders(session);
    expect(session.recorders[0]?.recorder.resume).toHaveBeenCalledOnce();
    expect(session.audioRecorder?.recorder.resume).toHaveBeenCalledOnce();
  });

  it('updates only the selected live media tracks and stays null-safe', () => {
    const session = createSession();
    setSessionMediaEnabled(session, { microphoneEnabled: false, webcamEnabled: false });
    expect(session.audioRecorder?.stream.getAudioTracks()[0]?.enabled).toBe(false);
    setSessionMediaEnabled(null, { microphoneEnabled: true, webcamEnabled: true });
    pauseSessionRecorders(null);
    resumeSessionRecorders(null);
  });
});
