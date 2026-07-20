import {
  assertEffectDecodedAudio,
  EFFECT_RUNTIME_RESOURCE_LIMITS,
  EffectRuntimeResourceError,
} from '../runtime/resource-limits';

interface EffectAudioBufferShape {
  length: number;
  numberOfChannels: number;
  sampleRate: number;
}

export interface EffectAudioBufferCache<TBuffer extends EffectAudioBufferShape> {
  dispose(): void;
  get(key: string): TBuffer | undefined;
  loadOrDecode(key: string, decode: () => Promise<TBuffer>): Promise<TBuffer>;
  snapshot(): { active: number; entries: number; pending: number; retainedBytes: number };
}

interface CacheEntry<TBuffer> {
  buffer: TBuffer;
  bytes: number;
}

interface EffectAudioBufferCacheState<TBuffer> {
  active: number;
  disposed: boolean;
  entries: Map<string, CacheEntry<TBuffer>>;
  inFlight: Map<string, Promise<TBuffer>>;
  pending: number;
  retainedBytes: number;
  waiters: Array<() => void>;
}

export function createEffectAudioBufferCache<
  TBuffer extends EffectAudioBufferShape,
>(): EffectAudioBufferCache<TBuffer> {
  const state = createEffectAudioBufferCacheState<TBuffer>();

  return {
    dispose: () => disposeEffectAudioBufferCache(state),
    get: (key) => readEffectAudioBufferCache(state, key),
    loadOrDecode: (key, decode) => loadOrDecodeEffectAudioBuffer(state, key, decode),
    snapshot: () => ({
      active: state.active,
      entries: state.entries.size,
      pending: state.pending,
      retainedBytes: state.retainedBytes,
    }),
  };
}

function createEffectAudioBufferCacheState<TBuffer>(): EffectAudioBufferCacheState<TBuffer> {
  return {
    active: 0,
    disposed: false,
    entries: new Map(),
    inFlight: new Map(),
    pending: 0,
    retainedBytes: 0,
    waiters: [],
  };
}

function readEffectAudioBufferCache<TBuffer>(
  state: EffectAudioBufferCacheState<TBuffer>,
  key: string
): TBuffer | undefined {
  const entry = state.entries.get(key);
  if (!entry) return undefined;
  state.entries.delete(key);
  state.entries.set(key, entry);
  return entry.buffer;
}

async function acquireEffectAudioDecodeSlot<TBuffer>(
  state: EffectAudioBufferCacheState<TBuffer>
): Promise<void> {
  if (state.disposed) throw new EffectRuntimeResourceError();
  if (state.active < EFFECT_RUNTIME_RESOURCE_LIMITS.maxAudioDecodeConcurrency) {
    state.active += 1;
    return;
  }
  if (state.pending >= EFFECT_RUNTIME_RESOURCE_LIMITS.maxAudioDecodeQueueDepth) {
    throw new EffectRuntimeResourceError();
  }
  state.pending += 1;
  await new Promise<void>((resolve) => state.waiters.push(resolve));
  state.pending -= 1;
  if (state.disposed) throw new EffectRuntimeResourceError();
  state.active += 1;
}

function releaseEffectAudioDecodeSlot<TBuffer>(state: EffectAudioBufferCacheState<TBuffer>): void {
  state.active -= 1;
  state.waiters.shift()?.();
}

function retainEffectAudioBuffer<TBuffer extends EffectAudioBufferShape>(
  state: EffectAudioBufferCacheState<TBuffer>,
  key: string,
  buffer: TBuffer
): void {
  if (state.disposed) return;
  const bytes = assertEffectDecodedAudio({
    channels: buffer.numberOfChannels,
    frames: buffer.length,
    sampleRate: buffer.sampleRate,
  });
  while (
    state.entries.size >= EFFECT_RUNTIME_RESOURCE_LIMITS.maxDecodedAudioCacheEntries ||
    state.retainedBytes + bytes > EFFECT_RUNTIME_RESOURCE_LIMITS.maxDecodedAudioBytes
  ) {
    evictOldestEffectAudioBuffer(state);
  }
  state.entries.set(key, { buffer, bytes });
  state.retainedBytes += bytes;
}

function evictOldestEffectAudioBuffer<TBuffer>(state: EffectAudioBufferCacheState<TBuffer>): void {
  const oldest = state.entries.entries().next().value;
  if (!oldest) throw new EffectRuntimeResourceError();
  state.entries.delete(oldest[0]);
  state.retainedBytes -= oldest[1].bytes;
}

function loadOrDecodeEffectAudioBuffer<TBuffer extends EffectAudioBufferShape>(
  state: EffectAudioBufferCacheState<TBuffer>,
  key: string,
  decode: () => Promise<TBuffer>
): Promise<TBuffer> {
  const cached = readEffectAudioBufferCache(state, key);
  if (cached) return Promise.resolve(cached);
  const pendingDecode = state.inFlight.get(key);
  if (pendingDecode) return pendingDecode;
  const operation = decodeAndRetainEffectAudioBuffer(state, key, decode).finally(() =>
    state.inFlight.delete(key)
  );
  state.inFlight.set(key, operation);
  return operation;
}

async function decodeAndRetainEffectAudioBuffer<TBuffer extends EffectAudioBufferShape>(
  state: EffectAudioBufferCacheState<TBuffer>,
  key: string,
  decode: () => Promise<TBuffer>
): Promise<TBuffer> {
  let acquired = false;
  try {
    await acquireEffectAudioDecodeSlot(state);
    acquired = true;
    const buffer = await decode();
    retainEffectAudioBuffer(state, key, buffer);
    return buffer;
  } finally {
    if (acquired) releaseEffectAudioDecodeSlot(state);
  }
}

function disposeEffectAudioBufferCache<TBuffer>(state: EffectAudioBufferCacheState<TBuffer>): void {
  state.disposed = true;
  state.entries.clear();
  state.retainedBytes = 0;
  while (state.waiters.length > 0) state.waiters.shift()?.();
}
