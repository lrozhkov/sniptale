import { describe, expect, it, vi } from 'vitest';
import { createArchiveOutputBoundary } from './output';

describe('archive output boundary', () => {
  it('reports compressed output progress after the destination accepts each chunk', async () => {
    const progress: number[] = [];
    const output = createArchiveOutputBoundary(
      new WritableStream({ write: () => undefined }),
      10,
      (bytes) => progress.push(bytes)
    );
    const writer = output.writable.getWriter();
    await writer.write(new Uint8Array(2));
    await writer.write(new Uint8Array(3));
    expect(progress).toEqual([2, 5]);
    writer.releaseLock();
    output.release();
  });
  it('forwards chunks up to the compressed byte ceiling', async () => {
    const chunks: number[] = [];
    const destination = new WritableStream<Uint8Array>({
      write(chunk) {
        chunks.push(chunk.byteLength);
      },
    });
    const boundary = createArchiveOutputBoundary(destination, 5);
    const writer = boundary.writable.getWriter();

    await writer.write(new Uint8Array(2));
    await writer.write(new Uint8Array(3));
    writer.releaseLock();
    boundary.release();

    expect(chunks).toEqual([2, 3]);
  });

  it('rejects before forwarding a chunk that exceeds the ceiling', async () => {
    const write = vi.fn();
    const destination = new WritableStream<Uint8Array>({ write });
    const boundary = createArchiveOutputBoundary(destination, 4);
    const writer = boundary.writable.getWriter();

    await expect(writer.write(new Uint8Array(5))).rejects.toThrow('compressed byte budget');
    writer.releaseLock();
    boundary.release();

    expect(write).not.toHaveBeenCalled();
  });
});
