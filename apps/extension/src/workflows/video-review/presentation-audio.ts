import { AudioSample, canEncodeAudio, type InputAudioTrack } from 'mediabunny';
import {
  presentationAudioGain,
  type PresentationSequencePlan,
} from '../../features/video/review/presentation-sequence';
import type { buildReviewTimeMap } from '../../features/video/review/timeline';
import { createReviewAudioClipRenderer } from './audio-clip-render';
import { renderReviewAudio, type ReviewExportClipPlan } from './audio-render';
import {
  quickEditAudioSourceKey,
  iterateQuickEditActionAudioPlan,
} from '../../features/video/review/advanced/audio-plan';

type MainSegment = ReturnType<typeof buildReviewTimeMap>[number];
type Placement = PresentationSequencePlan['segments'][number];
const sampleRate = 48_000;

/** Tracks are borrowed from the media owner and must remain live until iteration completes. */
export interface PresentationAudioInput {
  plan: PresentationSequencePlan;
  /** Absolute 48kHz interval; timestamps and envelope stay on the full sequence clock. */
  window?: { start: number; end: number };
  main: {
    track: InputAudioTrack | null;
    segments: readonly MainSegment[];
    /** Speed-edit/source mute only; external music and voice remain independently audible. */
    isOriginalMuted(segment: MainSegment): boolean;
    exportAudio?: ReviewExportClipPlan;
  };
  bookends: Partial<
    Record<
      'intro' | 'outro',
      {
        track: InputAudioTrack | null;
        muted: boolean;
        gain: number;
      }
    >
  >;
  signal: AbortSignal;
}

type AudioPart = {
  track: InputAudioTrack | null;
  segment: MainSegment;
  muted: boolean;
  exportAudio?: ReviewExportClipPlan;
};

function hasClips(part: AudioPart): boolean {
  const plan = part.exportAudio;
  if (!plan) return false;
  const audible = (entry: ReviewExportClipPlan['entries'][number]) =>
    entry.volume > 0 &&
    entry.timelineStart < part.segment.resultEnd &&
    entry.timelineStart + entry.duration > part.segment.resultStart &&
    plan.buffers.has(quickEditAudioSourceKey(entry.source));
  if (plan.action)
    for (const batch of iterateQuickEditActionAudioPlan(plan.action, {
      start: part.segment.resultStart,
      end: part.segment.resultEnd,
    }))
      if (batch.some(audible)) return true;
  return plan.entries.some(audible);
}

function hasOriginal(part: AudioPart): boolean {
  return !!part.track && !part.muted && (part.exportAudio?.originalVolume ?? 1) > 0;
}

function* rawAudioParts(args: PresentationAudioInput, placement: Placement): Iterable<AudioPart> {
  if (placement.content.kind === 'main') {
    for (const segment of args.main.segments) {
      if (segment.kind === 'cut' || segment.resultEnd <= segment.resultStart) continue;
      yield {
        track: args.main.track,
        segment,
        muted: args.main.isOriginalMuted(segment) || !!args.main.exportAudio?.originalMuted,
        ...(args.main.exportAudio ? { exportAudio: args.main.exportAudio } : {}),
      };
    }
  } else if (placement.content.kind === 'video' && placement.name !== 'main') {
    const audio = args.bookends[placement.name];
    if (!audio) throw new Error('Missing presentation audio binding.');
    yield {
      track: audio.track,
      muted: audio.muted,
      segment: {
        kind: 'keep',
        sourceStart: placement.content.sourceStart,
        sourceEnd: placement.content.sourceEnd,
        resultStart: 0,
        resultEnd: placement.contentDuration,
        rate: 1,
      },
      exportAudio: {
        entries: [],
        buffers: new Map(),
        originalVolume: audio.gain,
        originalMuted: audio.muted,
      },
    };
  }
}

function audioWindow(args: PresentationAudioInput) {
  const end = args.plan.segments.at(-1)?.audioEnd ?? 0;
  const window = args.window ?? { start: 0, end };
  if (
    !Number.isSafeInteger(window.start) ||
    !Number.isSafeInteger(window.end) ||
    window.start < 0 ||
    window.end > end ||
    window.end < window.start ||
    (args.window && window.end === window.start)
  )
    throw new Error('Invalid presentation audio window.');
  return window;
}

function* audioParts(args: PresentationAudioInput, placement: Placement): Iterable<AudioPart> {
  const window = audioWindow(args);
  const from = Math.max(placement.audioStart, window.start);
  const to = Math.min(placement.audioEnd, window.end);
  if (to <= from) return;
  for (const part of rawAudioParts(args, placement)) {
    if (!args.window) {
      yield part;
      continue;
    }
    const start = Math.max(part.segment.resultStart, (from - placement.audioStart) / sampleRate);
    const end = Math.min(part.segment.resultEnd, (to - placement.audioStart) / sampleRate);
    if (end <= start) continue;
    yield {
      ...part,
      segment: {
        ...part.segment,
        sourceStart:
          part.segment.sourceStart + (start - part.segment.resultStart) * part.segment.rate,
        sourceEnd: part.segment.sourceStart + (end - part.segment.resultStart) * part.segment.rate,
        resultStart: start,
        resultEnd: end,
      },
    };
  }
}

/** Probe potential sound and the chosen stereo layout, independently of the main index's audio. */
export async function probePresentationAudio(
  args: PresentationAudioInput,
  container: 'mp4' | 'webm'
): Promise<{ audible: boolean; multichannel: boolean; codec: 'aac' | 'opus' | null }> {
  audioWindow(args);
  let audible = false;
  let multichannel = false;
  const tracks = new Set<InputAudioTrack>();
  for (const placement of args.plan.segments) {
    for (const part of audioParts(args, placement)) {
      args.signal.throwIfAborted();
      if (!hasOriginal(part) && !hasClips(part)) continue;
      audible = true;
      if (part.track) tracks.add(part.track);
    }
  }
  for (const track of tracks) {
    const channels = await track.getNumberOfChannels();
    const rate = await track.getSampleRate();
    args.signal.throwIfAborted();
    if (
      !Number.isInteger(channels) ||
      channels < 1 ||
      channels > 8 ||
      !Number.isFinite(rate) ||
      rate < 8000 ||
      rate > 192_000
    )
      throw new Error('Unsupported presentation audio input.');
    const decodable = await track.canDecode();
    args.signal.throwIfAborted();
    if (!decodable) throw new Error('Unsupported presentation audio input.');
    multichannel ||= channels > 2;
  }
  args.signal.throwIfAborted();
  const codec = container === 'mp4' ? 'aac' : 'opus';
  const supported =
    audible &&
    typeof OfflineAudioContext !== 'undefined' &&
    (await canEncodeAudio(codec, { numberOfChannels: 2, sampleRate }));
  args.signal.throwIfAborted();
  return { audible, multichannel, codec: supported ? codec : null };
}

/** Fold discrete channels without assuming speaker labels; only the final mix is clamped. */
function stereoFrames(sample: AudioSample, offset: number, count: number): Float32Array {
  if (
    sample.sampleRate !== sampleRate ||
    sample.numberOfChannels < 1 ||
    sample.numberOfChannels > 8
  )
    throw new Error('Invalid presentation audio sample layout.');
  const stereo = new Float32Array(count * 2);
  const plane = new Float32Array(count);
  const channels = sample.numberOfChannels;
  for (let channel = 0; channel < channels; channel++) {
    sample.copyTo(plane, {
      format: 'f32-planar',
      planeIndex: channel,
      frameOffset: offset,
      frameCount: count,
    });
    const side = channel % 2;
    const divisor = side === 0 ? Math.ceil(channels / 2) : Math.floor(channels / 2);
    for (let frame = 0; frame < count; frame++)
      stereo[side * count + frame] = stereo[side * count + frame]! + plane[frame]! / divisor;
  }
  if (channels === 1) stereo.set(stereo.subarray(0, count), count);
  return stereo;
}

function outputSample(
  plan: PresentationSequencePlan,
  start: number,
  data: Float32Array
): AudioSample {
  const count = data.length / 2;
  for (let frame = 0; frame < count; frame++) {
    const gain = presentationAudioGain(plan, start + frame);
    for (let side = 0; side < 2; side++) {
      const index = side * count + frame;
      const value = data[index]!;
      if (!Number.isFinite(value)) throw new Error('Invalid presentation audio PCM.');
      data[index] = Math.max(-1, Math.min(1, value)) * gain;
    }
  }
  return new AudioSample({
    data,
    format: 'f32-planar',
    numberOfChannels: 2,
    sampleRate,
    timestamp: start / sampleRate,
  });
}

async function* silence(args: PresentationAudioInput, start: number, end: number) {
  for (let frame = start; frame < end; frame += sampleRate) {
    args.signal.throwIfAborted();
    const sample = outputSample(
      args.plan,
      frame,
      new Float32Array(Math.min(sampleRate, end - frame) * 2)
    );
    try {
      yield sample;
    } finally {
      sample.close();
    }
  }
}

/**
 * Emits exact absolute sequence bounds in <=1s windows. Consumer borrows each sample
 * until next/return; cancellation closes samples but never disposes borrowed media inputs.
 */
export async function* renderPresentationAudio(
  args: PresentationAudioInput
): AsyncGenerator<AudioSample> {
  const window = audioWindow(args);
  const clipRenderer = createReviewAudioClipRenderer();
  for (const placement of args.plan.segments) {
    let cursor = Math.max(placement.audioStart, window.start);
    const placementEnd = Math.min(placement.audioEnd, window.end);
    if (placementEnd <= cursor) continue;
    const contentEnd = Math.min(
      placementEnd,
      placement.audioStart + Math.round(placement.contentDuration * sampleRate)
    );
    for (const part of audioParts(args, placement)) {
      if (cursor >= contentEnd) break;
      args.signal.throwIfAborted();
      if (!hasOriginal(part) && !hasClips(part)) continue;
      for await (const input of renderReviewAudio(
        part.track,
        part.segment,
        part.muted,
        args.signal,
        part.exportAudio,
        clipRenderer
      )) {
        args.signal.throwIfAborted();
        const inputStart = placement.audioStart + Math.round(input.timestamp * sampleRate);
        const start = Math.max(cursor, inputStart);
        const end = Math.min(contentEnd, inputStart + input.numberOfFrames);
        if (end <= start) continue;
        yield* silence(args, cursor, start);
        for (let frame = start; frame < end; frame += sampleRate) {
          args.signal.throwIfAborted();
          const count = Math.min(sampleRate, end - frame);
          const sample = outputSample(
            args.plan,
            frame,
            stereoFrames(input, frame - inputStart, count)
          );
          try {
            yield sample;
          } finally {
            sample.close();
          }
        }
        cursor = end;
        if (cursor >= contentEnd) break;
      }
      if (cursor >= contentEnd) break;
    }
    yield* silence(args, cursor, placementEnd);
  }
}
