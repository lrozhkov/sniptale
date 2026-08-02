import { expect, it, vi } from 'vitest';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import type { FinalizedRecordingStagingArtifact } from '../../../composition/persistence/recordings/staging';
import { createMultiSourceLifecycle, type MultiSourceSession } from './state';
import { setActiveMultiSourceSession } from './state';
import { stopMultiSourceSession } from './stop';

function createArtifact(id: string): FinalizedRecordingStagingArtifact {
  const file = new File(['media'], `${id}.webm`, { type: 'video/webm' });
  return {
    artifactId: id,
    file,
    filename: file.name,
    mimeType: file.type,
    size: file.size,
  };
}

function createSession(): MultiSourceSession {
  const lifecycle = createMultiSourceLifecycle();
  lifecycle.activate();
  const artifact = createArtifact('rec-window-1');
  return {
    audioRecorder: null,
    durationTimer: null,
    lifecycle,
    recorders: [
      {
        artifact: null,
        artifactSession: {
          abort: vi.fn(),
          recorder: {} as MediaRecorder,
          setLifecycleCallbacks: vi.fn(),
          start: vi.fn(),
          stop: vi.fn().mockResolvedValue(artifact),
        },
        label: 'Window 1',
        recorder: {} as MediaRecorder,
        recordingId: artifact.artifactId,
        sourceIndex: 0,
        stream: { getTracks: () => [] } as unknown as MediaStream,
        trackSettings: { height: 720, width: 1280 },
      },
    ],
    recordingId: 'rec',
    settings: DEFAULT_VIDEO_SETTINGS,
    staging: {
      abort: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
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

it('deduplicates stop and finalizes only after every artifact session drains', async () => {
  const session = createSession();
  const finalizeSession = vi.fn().mockResolvedValue(undefined);
  setActiveMultiSourceSession(session);

  const first = stopMultiSourceSession({ discard: false, finalizeSession, session });
  const second = stopMultiSourceSession({ discard: false, finalizeSession, session });
  expect(first).toBe(second);
  await first;

  expect(session.recorders[0]?.artifactSession.stop).toHaveBeenCalledOnce();
  expect(finalizeSession).toHaveBeenCalledWith(session);
});

it('aborts staging instead of finalizing a discarded artifact set', async () => {
  const session = createSession();
  const finalizeSession = vi.fn();
  setActiveMultiSourceSession(session);

  await stopMultiSourceSession({ discard: true, finalizeSession, session });

  expect(session.staging.abort).toHaveBeenCalledOnce();
  expect(finalizeSession).not.toHaveBeenCalled();
});
