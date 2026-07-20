export function throwIfOfflineAudioMixAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new DOMException('The export was aborted.', 'AbortError');
  }
}
