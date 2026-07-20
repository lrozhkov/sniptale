import { waitForDelay } from '../timing';

export async function waitForEncoderQueueCapacity(
  encoder: VideoEncoder | AudioEncoder,
  maxQueueSize: number,
  signal?: AbortSignal
): Promise<void> {
  while (encoder.encodeQueueSize > maxQueueSize) {
    if (signal?.aborted) {
      throw new DOMException('The export was aborted.', 'AbortError');
    }

    await waitForDelay(4, signal);
  }
}
