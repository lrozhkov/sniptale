import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  FinalizedRecordingStagingArtifact,
  RecordingStagingArtifactWriter,
  RecordingStagingCoordinator,
} from '../../../composition/persistence/recordings/staging';
import { createRecordingArtifactSession } from './artifact-session';
import { TestMediaStream } from '../multi-source/media-stream.test-support';

class FakeMediaRecorder {
  static constructorError: Error | null = null;
  mimeType = 'video/webm';
  ondataavailable: ((event: BlobEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onstart: ((event: Event) => void) | null = null;
  onstop: ((event: Event) => void) | null = null;
  state: RecordingState = 'inactive';

  constructor() {
    if (FakeMediaRecorder.constructorError) throw FakeMediaRecorder.constructorError;
  }

  requestData = vi.fn(() => {
    this.ondataavailable?.({ data: new Blob(['requested']) } as BlobEvent);
  });

  start = vi.fn(() => {
    this.state = 'recording';
    this.onstart?.(new Event('start'));
  });

  stop = vi.fn(() => {
    this.ondataavailable?.({ data: new Blob(['terminal']) } as BlobEvent);
    this.state = 'inactive';
    this.onstop?.(new Event('stop'));
  });
}

function createHarness(options: { appendError?: Error } = {}) {
  const writtenParts: Blob[] = [];
  let tail = Promise.resolve();
  const writer: RecordingStagingArtifactWriter = {
    abort: vi.fn().mockResolvedValue(undefined),
    append: vi.fn((chunk: Blob) => {
      tail = tail.then(async () => {
        if (options.appendError) throw options.appendError;
        writtenParts.push(chunk);
      });
      return tail;
    }),
    finalize: vi.fn(async (): Promise<FinalizedRecordingStagingArtifact> => {
      await tail;
      const file = new File(writtenParts, 'recording.webm', { type: 'video/webm' });
      return {
        artifactId: 'recording-1',
        file,
        filename: file.name,
        mimeType: file.type,
        size: file.size,
      };
    }),
  };
  const coordinator: RecordingStagingCoordinator = {
    abort: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    getPendingBytes: vi.fn(() => 0),
    openArtifact: vi.fn().mockResolvedValue(writer),
  };
  return { coordinator, writer, writtenParts };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

describe('recording artifact session', () => {
  beforeEach(() => {
    FakeMediaRecorder.constructorError = null;
    vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
  });

  it('includes requested and final data before resolving terminal finalization', async () => {
    const harness = createHarness();
    const session = await createRecordingArtifactSession({
      artifactId: 'recording-1',
      coordinator: harness.coordinator,
      filename: 'recording.webm',
      mimeType: 'video/webm',
      recorderOptions: { mimeType: 'video/webm' },
      stream: new TestMediaStream([]),
    });

    session.start();
    expect(session.recorder.start).toHaveBeenCalledWith(1_000);
    const artifact = await session.stop();

    expect(await artifact.file.text()).toBe('requestedterminal');
    expect(harness.writer.finalize).toHaveBeenCalledOnce();
    expect(harness.coordinator.delete).not.toHaveBeenCalled();
  });

  it('surfaces writer failure and aborts the aggregate coordinator', async () => {
    const appendError = new Error('writer failed');
    const harness = createHarness({ appendError });
    const onFailure = vi.fn();
    const session = await createRecordingArtifactSession({
      artifactId: 'recording-1',
      coordinator: harness.coordinator,
      filename: 'recording.webm',
      mimeType: 'video/webm',
      recorderOptions: { mimeType: 'video/webm' },
      stream: new TestMediaStream([]),
    });
    session.setLifecycleCallbacks({ onFailure });
    session.start();

    await expect(session.stop()).rejects.toBe(appendError);
    expect(onFailure).toHaveBeenCalledWith(appendError);
    expect(harness.coordinator.abort).toHaveBeenCalledOnce();
    expect(harness.writer.finalize).toHaveBeenCalledOnce();
  });

  it('is idempotent when multiple stop callers wait for one terminal artifact', async () => {
    const harness = createHarness();
    const session = await createRecordingArtifactSession({
      artifactId: 'recording-1',
      coordinator: harness.coordinator,
      filename: 'recording.webm',
      mimeType: 'video/webm',
      recorderOptions: { mimeType: 'video/webm' },
      stream: new TestMediaStream([]),
    });
    session.start();

    const first = session.stop();
    const second = session.stop();
    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    expect(session.recorder.stop).toHaveBeenCalledOnce();
  });

  it('rejects terminal waiters on abort and cannot resolve them from a racing stop callback', async () => {
    const harness = createHarness();
    const finalization = deferred<FinalizedRecordingStagingArtifact>();
    vi.mocked(harness.writer.finalize).mockReturnValue(finalization.promise);
    const session = await createRecordingArtifactSession({
      artifactId: 'recording-1',
      coordinator: harness.coordinator,
      filename: 'recording.webm',
      mimeType: 'video/webm',
      recorderOptions: { mimeType: 'video/webm' },
      stream: new TestMediaStream([]),
    });
    session.start();

    const terminal = session.stop();
    await session.abort();
    await expect(terminal).rejects.toThrow('recording-1 was aborted');
    await expect(session.stop()).rejects.toThrow('recording-1 was aborted');

    const artifact = {
      artifactId: 'recording-1',
      file: new File(['late'], 'recording.webm'),
      filename: 'recording.webm',
      mimeType: 'video/webm',
      size: 4,
    };
    finalization.resolve(artifact);
    await Promise.resolve();
    await expect(terminal).rejects.toThrow('recording-1 was aborted');
  });

  it('aborts staging when encoder construction fails after opening the artifact', async () => {
    const harness = createHarness();
    const constructorError = new Error('encoder unavailable');
    FakeMediaRecorder.constructorError = constructorError;

    await expect(
      createRecordingArtifactSession({
        artifactId: 'recording-1',
        coordinator: harness.coordinator,
        filename: 'recording.webm',
        mimeType: 'video/webm',
        recorderOptions: { mimeType: 'video/webm' },
        stream: new TestMediaStream([]),
      })
    ).rejects.toBe(constructorError);
    expect(harness.coordinator.abort).toHaveBeenCalledOnce();
  });

  it('still aborts staging and settles stop when a failure callback throws', async () => {
    const appendError = new Error('writer failed');
    const harness = createHarness({ appendError });
    const session = await createRecordingArtifactSession({
      artifactId: 'recording-1',
      coordinator: harness.coordinator,
      filename: 'recording.webm',
      mimeType: 'video/webm',
      recorderOptions: { mimeType: 'video/webm' },
      stream: new TestMediaStream([]),
    });
    session.setLifecycleCallbacks({
      onFailure: () => {
        throw new Error('callback failed');
      },
    });
    session.start();

    await expect(session.stop()).rejects.toThrow('failure handling also failed');
    expect(harness.coordinator.abort).toHaveBeenCalledOnce();
  });
});
