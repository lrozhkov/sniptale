import { describe, expect, it, vi } from 'vitest';
import { createArchiveOutputBoundary } from './output';

describe('archive output boundary', () => {
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
