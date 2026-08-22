import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveVideoFrameBuffer } from './live-video-frame-buffer';

function createEntry(timestampSeconds: number) {
  return {
    frame: new VideoFrame(new Uint8Array(4), {
      codedHeight: 1,
      codedWidth: 1,
      format: 'RGBA',
      timestamp: timestampSeconds * 1_000_000,
    }),
    timestampSeconds,
  };
}

beforeEach(() => {
  vi.stubGlobal(
    'VideoFrame',
    class {
      readonly close = vi.fn();
    }
  );
});

describe('LiveVideoFrameBuffer', () => {
  it('preserves FIFO order and applies bounded producer backpressure', async () => {
    const buffer = new LiveVideoFrameBuffer(2);
    const first = createEntry(0);
    const second = createEntry(1 / 60);

    expect(buffer.enqueue(first)).toBe(true);
    expect(buffer.enqueue(second)).toBe(true);
    expect(buffer.enqueue(createEntry(2 / 60))).toBe(false);
    let spaceAvailable = false;
    const waitingForSpace = buffer.waitForSpace().then((available) => {
      spaceAvailable = available;
    });
    await Promise.resolve();
    expect(spaceAvailable).toBe(false);

    await expect(buffer.dequeue()).resolves.toBe(first);
    await waitingForSpace;
    expect(spaceAvailable).toBe(true);
    await expect(buffer.dequeue()).resolves.toBe(second);
  });

  it('drains accepted frames after input closes', async () => {
    const buffer = new LiveVideoFrameBuffer(1);
    const entry = createEntry(0);
    expect(buffer.enqueue(entry)).toBe(true);

    buffer.closeInput();

    await expect(buffer.dequeue()).resolves.toBe(entry);
    await expect(buffer.dequeue()).resolves.toBeNull();
    await expect(buffer.waitForSpace()).resolves.toBe(false);
  });

  it('closes queued frames and releases waiters on abort', async () => {
    const buffer = new LiveVideoFrameBuffer(1);
    const entry = createEntry(0);
    expect(buffer.enqueue(entry)).toBe(true);
    const waitingForSpace = buffer.waitForSpace();

    buffer.abort();

    await expect(waitingForSpace).resolves.toBe(false);
    await expect(buffer.dequeue()).resolves.toBeNull();
    expect(entry.frame.close).toHaveBeenCalledOnce();
  });
});
