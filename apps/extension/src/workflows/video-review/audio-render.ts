import {
  AudioSample,
  AudioSampleSink,
  EncodedPacketSink,
  canEncodeAudio,
  type EncodedPacket,
  type InputAudioTrack,
} from 'mediabunny';
import type { buildReviewTimeMap } from '../../features/video/review/timeline';

type Segment = ReturnType<typeof buildReviewTimeMap>[number];
const outputRate = 48_000;
const paddingFrames = 960;

/** Capability is independent of packet-copy support; audio processing never enables video reencoding. */
export async function chooseReviewAudioCodec(track: InputAudioTrack, container: 'mp4' | 'webm') {
  if (typeof OfflineAudioContext === 'undefined' || !(await track.canDecode())) return null;
  const numberOfChannels = await track.getNumberOfChannels();
  const sampleRate = await track.getSampleRate();
  if (numberOfChannels < 1 || numberOfChannels > 8 || sampleRate < 8000 || sampleRate > 192_000)
    return null;
  const options = { numberOfChannels, sampleRate: outputRate };
  if (container === 'mp4' && (await canEncodeAudio('aac', options))) return 'aac' as const;
  return (await canEncodeAudio('opus', options)) ? ('opus' as const) : null;
}

/** At most one second of result PCM per yield; encoder lifetime belongs to the media output. */
export async function* renderReviewAudio(
  track: InputAudioTrack,
  segment: Segment,
  muted: boolean,
  signal: AbortSignal
): AsyncGenerator<AudioSample, void, unknown> {
  const sourceRate = await track.getSampleRate();
  const channels = await track.getNumberOfChannels();
  const sink = new AudioSampleSink(track);
  let frame = Math.round(segment.resultStart * outputRate);
  const end = Math.round(segment.resultEnd * outputRate);
  while (frame < end) {
    signal.throwIfAborted();
    const count = Math.min(outputRate, end - frame);
    const buffer = await renderWindow({
      sink,
      track,
      sourceRate,
      channels,
      segment,
      frame,
      count,
      muted,
      signal,
    });
    for (const sample of AudioSample.fromAudioBuffer(buffer, frame / outputRate)) {
      try {
        yield sample;
      } finally {
        sample.close();
      }
    }
    frame += count;
  }
}

async function renderWindow(args: {
  sink: AudioSampleSink;
  track: InputAudioTrack;
  sourceRate: number;
  channels: number;
  segment: Segment;
  frame: number;
  count: number;
  muted: boolean;
  signal: AbortSignal;
}) {
  const { segment, frame, count, channels, sourceRate, signal } = args;
  const start = segment.sourceStart + (frame / outputRate - segment.resultStart) * segment.rate;
  const windowStart = start - (paddingFrames / outputRate) * segment.rate;
  const windowEnd = start + ((count + paddingFrames) / outputRate) * segment.rate;
  const offline = new OfflineAudioContext(channels, paddingFrames + count, outputRate);
  if (!args.muted) {
    const pcm = offline.createBuffer(
      channels,
      Math.ceil((windowEnd - windowStart) * sourceRate),
      sourceRate
    );
    await fillWindow(args.track, args.sink, pcm, {
      windowStart,
      start: Math.max(windowStart, segment.sourceStart),
      end: Math.min(windowEnd, segment.sourceEnd),
      signal,
    });
    signal.throwIfAborted();
    const node = offline.createBufferSource();
    node.buffer = pcm;
    node.playbackRate.value = segment.rate;
    node.connect(offline.destination);
    node.start();
  }
  // A bounded render cannot be cancelled by Web Audio; check cancellation before using its result.
  const rendered = await offline.startRendering();
  signal.throwIfAborted();
  const result = new AudioBuffer({
    numberOfChannels: channels,
    length: count,
    sampleRate: outputRate,
  });
  for (let channel = 0; channel < channels; channel++)
    result.copyToChannel(
      rendered.getChannelData(channel).subarray(paddingFrames, paddingFrames + count),
      channel
    );
  return result;
}

/** Use codec sample duration, not muxer timestamps or a fixed assumed Opus frame size. */
export function audioPacketDuration(
  packet: EncodedPacket,
  codec: 'aac' | 'opus',
  sampleRate: number
) {
  if (codec === 'aac') return 1024 / sampleRate;
  const toc = packet.data[0];
  if (toc === undefined) throw new Error('Empty Opus packet.');
  const config = toc >> 3;
  const frameMs =
    config >= 16
      ? 2.5 * 2 ** (config & 3)
      : config >= 12
        ? 10 * 2 ** (config & 1)
        : [10, 20, 40, 60][config & 3]!;
  const code = toc & 3;
  const count = code === 0 ? 1 : code === 3 ? (packet.data[1] ?? 0) & 63 : 2;
  const duration = (count * frameMs) / 1000;
  if (duration <= 0 || duration > 0.12) throw new Error('Invalid Opus packet duration.');
  return duration;
}

async function fillWindow(
  track: InputAudioTrack,
  sink: AudioSampleSink,
  pcm: AudioBuffer,
  bounds: { windowStart: number; start: number; end: number; signal: AbortSignal }
) {
  const codec = track.codec;
  if (codec !== 'aac' && codec !== 'opus') throw new Error('Unsupported processed audio codec.');
  const packets = new EncodedPacketSink(track);
  let packet = (await packets.getPacket(bounds.start)) ?? (await packets.getFirstPacket());
  let run: { start: number; end: number } | null = null;
  while (packet && packet.timestamp < bounds.end) {
    bounds.signal.throwIfAborted();
    const duration = audioPacketDuration(packet, codec, pcm.sampleRate);
    if (packet.timestamp + duration > bounds.start) {
      if (run && packet.timestamp - run.end > duration / 2) {
        // Chromium can smooth discontinuous audio timestamps. Restart decoding across real packet gaps.
        await fillRun(sink, pcm, { ...bounds, ...run });
        run = null;
      }
      run ??= { start: Math.max(bounds.start, packet.timestamp), end: bounds.start };
      run.end = Math.min(bounds.end, packet.timestamp + duration);
    }
    packet = await packets.getNextPacket(packet);
  }
  if (run) await fillRun(sink, pcm, { ...bounds, ...run });
}

async function fillRun(
  sink: AudioSampleSink,
  pcm: AudioBuffer,
  bounds: { windowStart: number; start: number; end: number; signal: AbortSignal }
) {
  for await (const sample of sink.samples(bounds.start, bounds.end)) {
    try {
      bounds.signal.throwIfAborted();
      if (sample.sampleRate !== pcm.sampleRate || sample.numberOfChannels !== pcm.numberOfChannels)
        throw new Error('Audio parameters changed within the source track.');
      const offset = Math.max(0, Math.ceil((bounds.start - sample.timestamp) * pcm.sampleRate));
      const end = Math.min(
        sample.numberOfFrames,
        Math.floor((bounds.end - sample.timestamp) * pcm.sampleRate)
      );
      const destination = Math.round(
        (sample.timestamp + offset / pcm.sampleRate - bounds.windowStart) * pcm.sampleRate
      );
      if (end <= offset || destination < 0 || destination >= pcm.length) continue;
      const count = Math.min(end - offset, pcm.length - destination);
      for (let channel = 0; channel < pcm.numberOfChannels; channel++)
        sample.copyTo(pcm.getChannelData(channel).subarray(destination, destination + count), {
          planeIndex: channel,
          format: 'f32-planar',
          frameOffset: offset,
          frameCount: count,
        });
    } finally {
      sample.close();
    }
  }
}
