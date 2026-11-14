export const CANONICAL_AUDIO_RATE = 48_000;
export const AUDIO_PCM_MAX_READ_FRAMES = 4 * CANONICAL_AUDIO_RATE;
const RATE = CANONICAL_AUDIO_RATE;

/** Decoder ownership remains with the caller. Reads contain only the requested native frames. */
export interface AudioPcmSource {
  sampleRate: number;
  channels: 1 | 2;
  lengthFrames: number;
  read(startFrame: number, endFrame: number): Promise<readonly Float32Array[]>;
}
export interface CanonicalAudioSource {
  readonly channels: 1 | 2;
  readonly lengthFrames: number;
  read(startFrame: number, endFrame: number): Promise<Float32Array[]>;
  dispose(): void;
}

/** A fixed one-second grid makes SRC independent of preview/export query partitioning. */
export function createCanonicalAudioSource(
  source: AudioPcmSource,
  bounds: { start: number; end: number },
  checkCancelled: () => void
): CanonicalAudioSource {
  if (
    !Number.isSafeInteger(source.sampleRate) ||
    source.sampleRate < 8000 ||
    source.sampleRate > 192000 ||
    (source.channels !== 1 && source.channels !== 2) ||
    !Number.isSafeInteger(source.lengthFrames) ||
    source.lengthFrames < 0 ||
    !Number.isFinite(bounds.start) ||
    !Number.isFinite(bounds.end) ||
    bounds.start < 0 ||
    bounds.end < bounds.start
  )
    throw new Error('Invalid audio PCM source.');
  const lengthFrames = Math.round((bounds.end - bounds.start) * RATE),
    firstAllowed = Math.ceil(bounds.start * source.sampleRate),
    lastAllowed = Math.min(source.lengthFrames, Math.ceil(bounds.end * source.sampleRate));
  if (
    !Number.isSafeInteger(lengthFrames) ||
    !Number.isSafeInteger(firstAllowed) ||
    !Number.isSafeInteger(lastAllowed)
  )
    throw new Error('Audio source frame count is invalid.');
  let disposed = false,
    queue: Promise<void> = Promise.resolve();
  const cache = new Map<number, Promise<Float32Array[]>>();
  function check() {
    if (disposed) throw new Error('Audio source is disposed.');
    checkCancelled();
  }
  async function nativeWindow(first: number, last: number) {
    check();
    const from = Math.max(0, firstAllowed, first),
      to = Math.min(lastAllowed, last);
    if (to <= from)
      return {
        start: from,
        planes: Array.from({ length: source.channels }, () => new Float32Array(0)),
      };
    const planes = await source.read(from, to);
    check();
    if (
      planes.length !== source.channels ||
      planes.some((plane) => plane.length !== to - from || !plane.every(Number.isFinite))
    )
      throw new Error('Decoder returned invalid audio PCM.');
    return { start: from, planes };
  }
  async function loadBlock(block: number): Promise<Float32Array[]> {
    check();
    if (source.sampleRate === RATE) {
      const first = firstAllowed + block * RATE,
        window = await nativeWindow(first, first + RATE);
      const output = Array.from({ length: source.channels }, () => new Float32Array(RATE));
      for (let c = 0; c < source.channels; c++)
        if (window.planes[c]!.length) output[c]!.set(window.planes[c]!, window.start - first);
      return output;
    }
    if (typeof OfflineAudioContext === 'undefined')
      throw new Error('Audio sample-rate conversion is unavailable.');
    const startTime = bounds.start + block - 1,
      first = Math.ceil(startTime * source.sampleRate);
    const window = await nativeWindow(first, first + 3 * source.sampleRate);
    const context = new OfflineAudioContext(source.channels, 3 * RATE, RATE),
      buffer = context.createBuffer(source.channels, 3 * source.sampleRate, source.sampleRate),
      node = context.createBufferSource();
    try {
      for (let c = 0; c < source.channels; c++)
        if (window.planes[c]!.length)
          buffer.getChannelData(c).set(window.planes[c]!, window.start - first);
      node.buffer = buffer;
      node.connect(context.destination);
      // Schedule the first integer native frame on the output clock, avoiding native offset rounding.
      node.start(Math.max(0, first / source.sampleRate - startTime));
      const rendered = await context.startRendering();
      check();
      return Array.from({ length: source.channels }, (_, c) =>
        rendered.getChannelData(c).slice(RATE, 2 * RATE)
      );
    } finally {
      node.disconnect();
      node.buffer = null;
    }
  }
  function getBlock(block: number) {
    const current = cache.get(block);
    if (current) return current;
    const pending = loadBlock(block).catch((error: unknown) => {
      if (cache.get(block) === pending) cache.delete(block);
      throw error;
    });
    cache.set(block, pending);
    while (cache.size > 2) cache.delete(cache.keys().next().value!);
    return pending;
  }
  async function read(start: number, end: number) {
    check();
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      end < start ||
      end - start > AUDIO_PCM_MAX_READ_FRAMES
    )
      throw new Error('Invalid bounded audio read.');
    const output = Array.from({ length: source.channels }, () => new Float32Array(end - start));
    const from = Math.max(0, start),
      to = Math.min(lengthFrames, end);
    for (let first = from; first < to;) {
      const block = Math.floor(first / RATE),
        last = Math.min(to, (block + 1) * RATE);
      const planes = await getBlock(block);
      check();
      for (let c = 0; c < source.channels; c++)
        output[c]!.set(
          planes[c]!.subarray(first - block * RATE, last - block * RATE),
          first - start
        );
      first = last;
    }
    return output;
  }
  return {
    channels: source.channels,
    lengthFrames,
    read(start, end) {
      const request = queue.then(() => read(start, end));
      queue = request.then(
        () => {},
        () => {}
      );
      return request;
    },
    dispose() {
      disposed = true;
      cache.clear();
    },
  };
}
