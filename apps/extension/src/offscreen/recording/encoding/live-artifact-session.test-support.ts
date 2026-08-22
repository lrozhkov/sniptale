import { vi } from 'vitest';

export function createControlledVideoProcessorTestDouble() {
  let controller: ReadableStreamDefaultController<VideoFrame> | undefined;
  const read = vi.fn();
  const readable = new ReadableStream<VideoFrame>(
    {
      pull() {
        read();
      },
      start(streamController) {
        controller = streamController;
      },
    },
    { highWaterMark: 0 }
  );

  return {
    deliver(frame: VideoFrame) {
      if (!controller) throw new Error('Controlled video processor is not initialized.');
      controller.enqueue(frame);
    },
    processor: class {
      readonly readable = readable;
    },
    read,
  };
}
