import { createTempoProcessor } from '../../features/video/audio/tempo';
import {
  AudioSample,
  AudioSampleSink,
  EncodedPacketSink,
  canEncodeAudio,
  type EncodedPacket,
  type InputAudioTrack,
} from 'mediabunny';
import type { buildReviewTimeMap } from '../../features/video/review/timeline';
import { buildQuickEditClipEnvelope } from '../../features/video/review/advanced/audio-plan';
import type { QuickEditAudioPlanEntry } from '../../features/video/review/advanced/audio-plan';

export interface ReviewExportClipPlan {
  /** Fragment-local entries: output time is already shifted into the fragment. */
  entries: readonly QuickEditAudioPlanEntry[];
  buffers: ReadonlyMap<string, AudioBuffer>;
  originalVolume: number;
  originalMuted: boolean;
}

type Segment = ReturnType<typeof buildReviewTimeMap>[number];
const outputRate = 48_000;
const paddingFrames = 960;

/** Capability is independent of packet-copy support; audio processing never enables video reencoding. */
export async function chooseReviewAudioCodec(
  track: InputAudioTrack | null,
  container: 'mp4' | 'webm'
) {
  if (typeof OfflineAudioContext === 'undefined') return null;
  let numberOfChannels = 2;
  let sampleRate = outputRate;
  if (track) {
    if (!(await track.canDecode())) return null;
    numberOfChannels = await track.getNumberOfChannels();
    sampleRate = await track.getSampleRate();
    if (numberOfChannels < 1 || numberOfChannels > 8 || sampleRate < 8000 || sampleRate > 192_000)
      return null;
  }
  const options = { numberOfChannels, sampleRate: outputRate };
  if (container === 'mp4' && (await canEncodeAudio('aac', options))) return 'aac' as const;
  return (await canEncodeAudio('opus', options)) ? ('opus' as const) : null;
}

/** At most one second of output and four seconds of source PCM per yield, plus resampler context. */
export async function* renderReviewAudio(
  track: InputAudioTrack | null,
  segment: Segment,
  muted: boolean,
  signal: AbortSignal,
  exportAudio?: ReviewExportClipPlan
): AsyncGenerator<AudioSample, void, unknown> {
  const sink = track ? new AudioSampleSink(track) : null;
  const sourceRate = track ? await track.getSampleRate() : outputRate;
  const channels = track ? await track.getNumberOfChannels() : 2;
  const tempo =
    segment.rate !== 1 ? createReviewTempo(sourceRate, channels, segment.rate) : undefined;
  let frame = Math.round(segment.resultStart * outputRate);
  const end = Math.round(segment.resultEnd * outputRate);
  while (frame < end) {
    signal.throwIfAborted();
    const count = Math.min(outputRate, Math.floor((4 * outputRate) / segment.rate), end - frame);
    const buffer = await renderWindow({
      sink,
      track,
      sourceRate,
      channels,
      ...(tempo ? { tempo } : {}),
      segment,
      frame,
      count,
      muted,
      signal,
      ...(exportAudio ? { exportAudio } : {}),
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

interface AudioRenderWindow {
  sink: AudioSampleSink | null;
  track: InputAudioTrack | null;
  sourceRate: number;
  channels: number;
  segment: Segment;
  frame: number;
  count: number;
  muted: boolean;
  signal: AbortSignal;
  exportAudio?: ReviewExportClipPlan;
  tempo?: ReturnType<typeof createReviewTempo>;
}

async function renderWindow(args: AudioRenderWindow) {
  const { segment, frame, count, channels, sourceRate, signal } = args;
  const start = segment.sourceStart + (frame / outputRate - segment.resultStart) * segment.rate;
  const windowStart = start - (paddingFrames / outputRate) * segment.rate;
  const windowEnd = start + ((count + paddingFrames) / outputRate) * segment.rate;
  const offline = new OfflineAudioContext(channels, paddingFrames + count, outputRate);
  if (!args.muted && args.sink && args.track) {
    const node = offline.createBufferSource();
    if (args.tempo) {
      node.buffer = await renderTempoWindow(offline, args, args.tempo);
    } else {
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
      node.buffer = pcm;
    }
    node.playbackRate.value = 1;
    connectOriginal(node, offline, args.exportAudio);
    node.start();
  }
  scheduleClipWindows(offline, args);
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

/** The original track gain lives in the mix so amplification is not capped by the element. */
function connectOriginal(
  node: AudioBufferSourceNode,
  offline: OfflineAudioContext,
  exportAudio?: ReviewExportClipPlan
) {
  const gain = exportAudio && exportAudio.originalVolume !== 1 ? offline.createGain() : null;
  if (gain && exportAudio) {
    gain.gain.value = exportAudio.originalVolume;
    node.connect(gain);
    gain.connect(offline.destination);
  } else node.connect(offline.destination);
}

const leadSeconds = paddingFrames / outputRate;

function scheduleClipWindows(
  offline: OfflineAudioContext,
  args: { frame: number; count: number; exportAudio?: ReviewExportClipPlan }
) {
  const { frame, count } = args;
  const plan = args.exportAudio;
  if (!plan || !plan.entries.length) return;
  const outStart = frame / outputRate;
  const outEnd = (frame + count) / outputRate;
  for (const entry of plan.entries) {
    const audibleFrom = Math.max(outStart, entry.timelineStart);
    const audibleTo = Math.min(outEnd, entry.timelineStart + entry.duration);
    if (audibleTo <= audibleFrom) continue;
    const buffer = plan.buffers.get(entry.assetId);
    if (!buffer) continue;
    const source = offline.createBufferSource();
    source.buffer = buffer;
    const gain = offline.createGain();
    source.connect(gain);
    gain.connect(offline.destination);
    const localAt = (outputTime: number) => outputTime - entry.timelineStart;
    // Envelope automation is clip-local; points beyond the audible window are
    // skipped so gain events stay chronological for the offline context.
    const windowEndAt = leadSeconds + (audibleTo - outStart);
    const points = [
      ...buildQuickEditClipEnvelope({
        entry,
        duration: entry.duration,
        elapsed: Math.max(0, localAt(audibleFrom)),
      }),
    ].sort(([left], [right]) => left - right);
    let first = true;
    for (const [local, value] of points) {
      const at = leadSeconds + (entry.timelineStart + local - outStart);
      if (at < 0 || at > windowEndAt) continue;
      if (first) {
        gain.gain.setValueAtTime(value, Math.max(0, at));
        first = false;
      } else gain.gain.linearRampToValueAtTime(value, at);
    }
    const tailGain = buildQuickEditClipEnvelope({
      entry,
      duration: entry.duration,
      elapsed: Math.max(0, localAt(audibleTo)),
    })[0]![1];
    if (first) gain.gain.setValueAtTime(tailGain, windowEndAt);
    else gain.gain.linearRampToValueAtTime(tailGain, windowEndAt);
    source.start(
      leadSeconds + (audibleFrom - outStart),
      entry.sourceOffset + Math.max(0, localAt(audibleFrom)),
      audibleTo - audibleFrom
    );
  }
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

/** Keeps WSOLA overlap state across bounded decoder windows; each edit owns its own processor. */
async function renderTempoWindow(
  offline: OfflineAudioContext,
  args: AudioRenderWindow,
  tempo: ReturnType<typeof createReviewTempo>
) {
  const { segment, frame, count, sourceRate, channels, signal } = args;
  const relativeFrame = frame - Math.round(segment.resultStart * outputRate);
  const nativeCount = Math.max(
    1,
    Math.round(((relativeFrame + count) * sourceRate) / outputRate) -
      Math.round((relativeFrame * sourceRate) / outputRate)
  );
  const needed = nativeCount + tempo.padding - tempo.pending[0]!.length;
  const range = tempo.processor.inputRange(needed);
  const source = offline.createBuffer(channels, range.end - range.start, sourceRate);
  const origin = segment.sourceStart + range.start / sourceRate;
  await fillWindow(args.track!, args.sink!, source, {
    windowStart: origin,
    start: origin,
    end: Math.min(segment.sourceEnd, segment.sourceStart + range.end / sourceRate),
    signal,
  });
  signal.throwIfAborted();
  const planes = Array.from({ length: channels }, (_, c) => source.getChannelData(c));
  const stretched = tempo.processor.render((c, i) => planes[c]![i - range.start] ?? 0, needed);
  const result = new AudioBuffer({
    length: nativeCount + 2 * tempo.padding,
    numberOfChannels: channels,
    sampleRate: sourceRate,
  });
  for (let c = 0; c < channels; c++) {
    const output = result.getChannelData(c);
    output.set(tempo.previous[c]!);
    output.set(tempo.pending[c]!, tempo.padding);
    output.set(stretched[c]!, tempo.padding + tempo.pending[c]!.length);
    tempo.previous[c] = output.slice(nativeCount, nativeCount + tempo.padding);
    tempo.pending[c] = output.slice(nativeCount + tempo.padding);
  }
  return result;
}

/** Native-rate context on both sides keeps the browser resampler continuous at chunk seams. */
function createReviewTempo(sampleRate: number, channels: number, rate: number) {
  const padding = Math.round(sampleRate * leadSeconds);
  return {
    processor: createTempoProcessor(sampleRate, channels, rate),
    padding,
    previous: Array.from({ length: channels }, () => new Float32Array(padding)),
    pending: Array.from({ length: channels }, () => new Float32Array(0)),
  };
}
