import { EncodedAudioPacketSource, EncodedPacket, type AudioSample } from 'mediabunny';

type Options = {
  codec: 'aac' | 'opus';
  frameCount: number;
  signal: AbortSignal;
  onPacket?(packet: EncodedPacket): void;
};
type Window = { kind: 'aac-mp4' | 'opus-webm'; sampleRate: 48000; frameCount: number };
const RATE = 48_000;
const MAX_PACKETS = 1024;
const MAX_BYTES = 4 * 1024 * 1024;

/** Caller connects/starts Output before add, borrows input samples, and cancels Output on failure. */
export function createPresentationAudioEncoder(options: Options) {
  if (
    (options.codec !== 'aac' && options.codec !== 'opus') ||
    !Number.isSafeInteger(options.frameCount) ||
    options.frameCount <= 0 ||
    options.frameCount > RATE * 93_600
  )
    throw new Error('Invalid processed audio window.');
  options.signal.throwIfAborted();
  const owner = new ProcessedAudioEncoder(options);
  return {
    source: owner.source,
    window: owner.window,
    add: (sample: AudioSample) => owner.add(sample),
    finish: () => owner.finish(),
    dispose: () => owner.dispose(),
  };
}

class ProcessedAudioEncoder {
  readonly source: EncodedAudioPacketSource;
  readonly window: Readonly<Window>;
  private readonly encoder: AudioEncoder;
  private readonly stopped: Promise<never>;
  private rejectStopped!: (error: unknown) => void;
  private failure: unknown;
  private hasFailed = false;
  private finished = false;
  private busy = false;
  private submitted = 0;
  private readonly pcm = new Float32Array(RATE * 2);
  private buffered = 0;
  private encodedInput = 0;
  private encodedEnd = 0;
  private preSkip = 0;
  private config: AudioDecoderConfig | null = null;
  private configKey = '';
  private readonly queue: { packet: EncodedPacket; meta: EncodedAudioChunkMetadata }[] = [];
  private packetCount = 0;
  private packetBytes = 0;
  private draining: Promise<void> | null = null;
  constructor(private readonly options: Options) {
    this.source = new EncodedAudioPacketSource(options.codec);
    this.window = Object.freeze({
      kind: options.codec === 'aac' ? 'aac-mp4' : 'opus-webm',
      sampleRate: RATE,
      frameCount: options.frameCount,
    });
    this.stopped = new Promise<never>((_resolve, reject) => {
      this.rejectStopped = reject;
    });
    void this.stopped.catch(() => undefined);
    this.encoder = new AudioEncoder({
      output: (chunk, meta) => this.output(chunk, meta),
      error: (error) => this.fail(error),
    });
    try {
      this.encoder.configure({
        codec: options.codec === 'aac' ? 'mp4a.40.2' : 'opus',
        sampleRate: RATE,
        numberOfChannels: 2,
        bitrate: 128_000,
      });
    } catch (error) {
      this.encoder.close();
      throw error;
    }
    options.signal.addEventListener('abort', this.abort, { once: true });
    if (options.signal.aborted) this.abort();
  }
  private abort = () => this.fail(this.options.signal.reason);
  private check() {
    if (this.hasFailed) throw this.failure;
    if (this.finished) throw new Error('Processed audio encoder is finished.');
  }
  private fail(error: unknown) {
    if (this.hasFailed || this.finished) return;
    this.hasFailed = true;
    this.failure = error;
    this.options.signal.removeEventListener('abort', this.abort);
    this.queue.length = 0;
    this.packetCount = 0;
    this.packetBytes = 0;
    if (this.encoder.state !== 'closed') this.encoder.close();
    this.rejectStopped(error);
  }
  dispose() {
    if (!this.finished)
      this.fail(new DOMException('Processed audio encoding cancelled.', 'AbortError'));
  }
  private wait<T>(promise: Promise<T>): Promise<T> {
    return Promise.race([promise, this.stopped]);
  }
  private async ready() {
    this.check();
    while (this.draining) await this.wait(this.draining);
    while (this.encoder.encodeQueueSize >= 2) {
      let release!: () => void;
      const listener = () => release();
      const dequeued = new Promise<void>((resolve) => {
        release = resolve;
        this.encoder.addEventListener('dequeue', listener, { once: true });
      });
      try {
        if (this.encoder.encodeQueueSize < 2) release();
        await this.wait(dequeued);
      } finally {
        this.encoder.removeEventListener('dequeue', listener);
      }
      this.check();
      while (this.draining) await this.wait(this.draining);
    }
    this.check();
  }
  private async exclusive(action: () => Promise<void>) {
    this.check();
    if (this.busy) throw new Error('Await the previous processed audio operation.');
    this.busy = true;
    try {
      await action();
    } catch (error) {
      this.fail(error);
      throw error;
    } finally {
      this.busy = false;
    }
  }
  add(sample: AudioSample): Promise<void> {
    return this.exclusive(async () => {
      if (
        sample.sampleRate !== RATE ||
        sample.numberOfChannels !== 2 ||
        !Number.isSafeInteger(sample.numberOfFrames) ||
        sample.numberOfFrames < 1 ||
        sample.numberOfFrames > RATE ||
        !Number.isFinite(sample.timestamp) ||
        Math.round(sample.timestamp * RATE) !== this.submitted ||
        this.submitted + sample.numberOfFrames > this.options.frameCount
      )
        throw new Error('Invalid processed audio sample.');
      await this.ready();
      for (let offset = 0; offset < sample.numberOfFrames;) {
        const count = Math.min(RATE - this.buffered, sample.numberOfFrames - offset);
        for (let planeIndex = 0; planeIndex < 2; planeIndex++) {
          sample.copyTo(this.pcm.subarray(planeIndex * RATE + this.buffered), {
            planeIndex,
            format: 'f32-planar',
            frameOffset: offset,
            frameCount: count,
          });
        }
        this.buffered += count;
        offset += count;
        if (this.buffered === RATE) await this.encodeBuffered();
      }
      this.submitted += sample.numberOfFrames;
      await this.ready();
    });
  }
  private async encodeBuffered() {
    await this.ready();
    const count = this.buffered;
    // Native AAC rejects some split partial inputs; submit a continuous one-second PCM lattice.
    this.pcm.copyWithin(count, RATE, RATE + count);
    const data = new AudioData({
      format: 'f32-planar',
      sampleRate: RATE,
      numberOfChannels: 2,
      numberOfFrames: count,
      timestamp: Math.round((this.encodedInput * 1_000_000) / RATE),
      data: this.pcm.subarray(0, count * 2),
    });
    try {
      this.encoder.encode(data);
    } finally {
      data.close();
    }
    this.encodedInput += count;
    this.buffered = 0;
    await this.ready();
  }
  finish(): Promise<void> {
    if (this.finished) return Promise.resolve();
    return this.exclusive(async () => {
      if (this.submitted !== this.options.frameCount)
        throw new Error('Incomplete processed audio input.');
      await this.ready();
      if (this.options.codec === 'aac') {
        for (let remaining = 4096; remaining > 0;) {
          const count = Math.min(RATE - this.buffered, remaining);
          this.pcm.fill(0, this.buffered, this.buffered + count);
          this.pcm.fill(0, RATE + this.buffered, RATE + this.buffered + count);
          this.buffered += count;
          remaining -= count;
          if (this.buffered === RATE) await this.encodeBuffered();
        }
      }
      if (this.buffered) await this.encodeBuffered();
      await this.wait(this.encoder.flush());
      while (this.draining) await this.wait(this.draining);
      this.check();
      if (!this.config || this.encodedEnd < this.options.frameCount + this.preSkip)
        throw new Error('Incomplete processed audio packet coverage.');
      this.source.close();
      this.encoder.close();
      this.options.signal.removeEventListener('abort', this.abort);
      this.finished = true;
    });
  }
  private acceptConfig(value: AudioDecoderConfig | undefined) {
    if (!value) {
      if (!this.config) throw new Error('Missing processed audio decoder configuration.');
      return;
    }
    const description = copyDescription(value.description);
    if (
      value.sampleRate !== RATE ||
      value.numberOfChannels !== 2 ||
      value.codec !== (this.options.codec === 'aac' ? 'mp4a.40.2' : 'opus') ||
      !description
    )
      throw new Error('Invalid processed audio decoder configuration.');
    const preSkip =
      this.options.codec === 'opus' ? opusPreSkip(description) : aacConfiguration(description);
    const key = JSON.stringify({
      codec: value.codec,
      sampleRate: value.sampleRate,
      numberOfChannels: value.numberOfChannels,
      description: Array.from(description),
    });
    if (this.config && key !== this.configKey)
      throw new Error('Processed audio decoder configuration changed.');
    if (this.config) return;
    this.configKey = key;
    this.preSkip = preSkip;
    this.config = { codec: value.codec, sampleRate: RATE, numberOfChannels: 2, description };
  }
  private output(chunk: EncodedAudioChunk, metadata?: EncodedAudioChunkMetadata) {
    if (this.hasFailed || this.finished) return;
    try {
      this.acceptConfig(metadata?.decoderConfig);
      const start = Math.round((chunk.timestamp * RATE) / 1_000_000);
      const count = Math.round(((chunk.duration ?? 0) * RATE) / 1_000_000);
      if (
        !Number.isSafeInteger(start) ||
        start !== this.encodedEnd ||
        !Number.isSafeInteger(count) ||
        count <= 0 ||
        !Number.isSafeInteger(start + count)
      )
        throw new Error('Noncontiguous processed audio packets.');
      this.encodedEnd = start + count;
      const endpoint = this.options.frameCount + this.preSkip;
      if (start >= endpoint) return;
      if (
        !Number.isSafeInteger(chunk.byteLength) ||
        chunk.byteLength < 1 ||
        this.packetCount >= MAX_PACKETS ||
        chunk.byteLength > MAX_BYTES - this.packetBytes
      )
        throw new Error('Processed audio packet queue exceeded.');
      const bytes = new Uint8Array(chunk.byteLength);
      chunk.copyTo(bytes);
      const timestamp =
        this.options.codec === 'aac'
          ? Math.floor((start * 1_000_000) / RATE) / 1_000_000
          : start / RATE;
      const end =
        this.options.codec === 'aac'
          ? (this.encodedEnd >= endpoint
              ? Math.ceil((endpoint * 1_000_000) / RATE)
              : Math.floor((this.encodedEnd * 1_000_000) / RATE)) / 1_000_000
          : this.encodedEnd / RATE;
      const packet = new EncodedPacket(bytes, chunk.type, timestamp, end - timestamp);
      this.queue.push({ packet, meta: { decoderConfig: this.config! } });
      this.packetCount++;
      this.packetBytes += bytes.byteLength;
      this.startDrain();
    } catch (error) {
      this.fail(error);
    }
  }
  private startDrain() {
    if (this.draining || this.hasFailed) return;
    const task = this.drain();
    this.draining = task;
    void task.then(
      () => {
        this.draining = null;
        if (this.queue.length) this.startDrain();
      },
      (error) => {
        this.draining = null;
        this.fail(error);
      }
    );
  }
  private async drain() {
    while (this.queue.length) {
      this.check();
      const next = this.queue.shift()!;
      await this.wait(this.source.add(next.packet, next.meta));
      this.check();
      this.packetCount--;
      this.packetBytes -= next.packet.byteLength;
      this.options.onPacket?.(next.packet);
    }
  }
}
function copyDescription(
  value: AllowSharedBufferSource | undefined
): Uint8Array<ArrayBuffer> | null {
  if (!value) return null;
  const view = ArrayBuffer.isView(value)
    ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
    : new Uint8Array(value);
  if (view.byteLength > 4096) throw new Error('Processed audio configuration exceeded.');
  return new Uint8Array(view);
}
function opusPreSkip(bytes: Uint8Array): number {
  if (
    bytes.length !== 19 ||
    String.fromCharCode(...bytes.subarray(0, 8)) !== 'OpusHead' ||
    bytes[8] !== 1 ||
    bytes[9] !== 2 ||
    bytes[18] !== 0 ||
    bytes[16] !== 0 ||
    bytes[17] !== 0
  )
    throw new Error('Invalid processed OpusHead.');
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(10, true);
}
function aacConfiguration(bytes: Uint8Array): number {
  if (
    bytes.length < 2 ||
    bytes[0]! >> 3 !== 2 ||
    (((bytes[0]! & 7) << 1) | (bytes[1]! >> 7)) !== 3 ||
    ((bytes[1]! >> 3) & 15) !== 2
  )
    throw new Error('Invalid processed AAC configuration.');
  return 0;
}
