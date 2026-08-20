import { expect, it, vi } from 'vitest';
import type { RecordingSidecarRecorder } from '../sidecar/types';
import { createWebcamProjectInput, stopWebcamRecorderStream } from './webcam';
import { createPreparedRecordingAssetForTest } from '../../../composition/persistence/recordings/staging/test-support';

function createWebcamRecorder(
  overrides: Partial<RecordingSidecarRecorder> = {}
): RecordingSidecarRecorder {
  const file = new File(['webcam'], 'webcam.webm', { type: 'video/webm' });
  return {
    artifact: {
      artifactId: 'rec-webcam',
      asset: createPreparedRecordingAssetForTest(file, 'rec-webcam'),
      filename: file.name,
      mimeType: file.type,
      size: file.size,
    },
    artifactSession: {
      abort: vi.fn(),
      recorder: {} as MediaRecorder,
      setLifecycleCallbacks: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    },
    filenameSuffix: 'webcam',
    kind: 'webcam',
    recorder: {} as MediaRecorder,
    release: vi.fn(),
    recordingId: 'rec-webcam',
    stream: {} as MediaStream,
    trackSettings: { height: 720, width: 1280 },
    ...overrides,
  };
}

it('builds project input only from a finalized webcam artifact', () => {
  expect(createWebcamProjectInput(null, 3)).toBeNull();
  expect(createWebcamProjectInput(createWebcamRecorder(), 3)).toEqual({
    duration: 3,
    filename: 'webcam.webm',
    height: 720,
    mimeType: 'video/webm',
    recordingId: 'rec-webcam',
    size: 6,
    width: 1280,
  });
  expect(() => createWebcamProjectInput(createWebcamRecorder({ artifact: null }), 3)).toThrow(
    'has no finalized media'
  );
});

it('rejects webcam project input when recorded dimensions are unavailable', () => {
  expect(() => createWebcamProjectInput(createWebcamRecorder({ trackSettings: {} }), 3)).toThrow(
    'Webcam recording dimensions are unavailable.'
  );
});

it('stops webcam recorder streams when rollback owns a created recorder', () => {
  const release = vi.fn();
  const recorder = createWebcamRecorder({
    release,
  });

  stopWebcamRecorderStream(null);
  stopWebcamRecorderStream(recorder);
  expect(release).toHaveBeenCalledOnce();
});
