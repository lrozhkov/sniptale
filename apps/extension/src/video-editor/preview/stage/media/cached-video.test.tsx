// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { PreviewStageCachedVideo } from './cached-video';

class FakeSourceBuffer extends EventTarget {
  readonly appended: ArrayBuffer[] = [];
  mode: AppendMode = 'segments';

  appendBuffer(bytes: BufferSource): void {
    const copied =
      bytes instanceof ArrayBuffer
        ? bytes.slice(0)
        : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    this.appended.push(copied as ArrayBuffer);
    queueMicrotask(() => this.dispatchEvent(new Event('updateend')));
  }
}

class BufferBackedBlob extends Blob {
  constructor(private readonly payload: Uint8Array) {
    super();
  }

  override arrayBuffer(): Promise<ArrayBuffer> {
    return Promise.resolve(this.payload.slice().buffer);
  }
}

class FakeMediaSource extends EventTarget {
  static latest: FakeMediaSource | null = null;
  static isTypeSupported = vi.fn(() => true);
  readonly sourceBuffer = new FakeSourceBuffer();
  readyState: ReadyState = 'closed';
  endOfStream = vi.fn(() => {
    this.readyState = 'ended';
  });

  constructor() {
    super();
    FakeMediaSource.latest = this;
  }

  addSourceBuffer() {
    return this.sourceBuffer;
  }

  open(): void {
    this.readyState = 'open';
    this.dispatchEvent(new Event('sourceopen'));
  }
}

let container: HTMLDivElement;
let root: Root;
const revokeObjectURL = vi.fn();

beforeEach(() => {
  FakeMediaSource.latest = null;
  FakeMediaSource.isTypeSupported.mockClear();
  revokeObjectURL.mockClear();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('MediaSource', FakeMediaSource);
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:cached-preview');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(revokeObjectURL);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('appends cached fragments in sequence and releases the MediaSource URL', async () => {
  await act(async () =>
    root.render(
      <PreviewStageCachedVideo
        currentTime={2.5}
        isPlaying={false}
        source={{
          codec: 'avc1.640033',
          endTime: 6,
          mimeType: 'video/mp4',
          segments: [
            new BufferBackedBlob(new Uint8Array([1])),
            new BufferBackedBlob(new Uint8Array([2])),
          ],
          startTime: 2,
        }}
      />
    )
  );
  await act(async () => {
    FakeMediaSource.latest?.open();
  });

  expect(FakeMediaSource.latest?.sourceBuffer.mode).toBe('sequence');
  expect(FakeMediaSource.isTypeSupported).toHaveBeenCalledWith('video/mp4; codecs="avc1.640033"');
  await vi.waitFor(() => expect(FakeMediaSource.latest?.sourceBuffer.appended).toHaveLength(2));
  expect(FakeMediaSource.latest?.endOfStream).toHaveBeenCalledOnce();
  expect(container.querySelector('video')?.currentTime).toBe(0.5);

  act(() => root.unmount());
  expect(revokeObjectURL).toHaveBeenCalledWith('blob:cached-preview');
  root = createRoot(container);
});
