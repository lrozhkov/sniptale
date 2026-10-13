import { browserRuntime } from '@sniptale/platform/browser/runtime';
import type { VideoProject } from '../../../features/video/project/types';
import { buildProjectActionAudioPlan } from '../../../features/video/review/project-action-audio';
import { iterateReviewActionAudioCues } from '../../../features/video/review/action-audio';
import {
  admitReviewActionAudioPlan,
  createReviewActionAudioSource,
  type ReviewActionAudioSource,
} from '../../../workflows/video-review/action-audio-source';

/** Adds one-second native attack windows to the existing job buffer; no whole attack graph is retained. */
export async function mixProjectActionAudio(
  output: AudioBuffer,
  project: VideoProject,
  signal?: AbortSignal,
  range?: { start: number; end: number }
) {
  const plan = buildProjectActionAudioPlan(project);
  if (!plan.descriptors.length) return;
  const job = new AbortController();
  const abort = () => job.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) job.abort();
  let decoder: AudioContext | undefined;
  let reader: ReviewActionAudioSource<AudioBuffer> | undefined;
  try {
    job.signal.throwIfAborted();
    decoder = new AudioContext({ sampleRate: 44100 });
    const decodingContext = decoder;
    reader = createReviewActionAudioSource({
      signal: job.signal,
      getURL: (path) => browserRuntime.getURL(path),
      fetch,
      decode: (bytes) => decodingContext.decodeAudioData(bytes),
    });
    const admission = await admitReviewActionAudioPlan(plan, job.signal);
    const bounds = range ?? { start: 0, end: plan.duration };
    const rate = output.sampleRate;
    for (let from = 0; from < output.length; from += rate) {
      job.signal.throwIfAborted();
      const to = Math.min(output.length, from + rate);
      for (const batch of iterateReviewActionAudioCues(plan, {
        start: bounds.start + from / rate,
        end: Math.min(bounds.end, bounds.start + to / rate),
      })) {
        for (const cue of batch) {
          const sample = await reader.read(cue.sampleId);
          job.signal.throwIfAborted();
          mixCueWindow({ output, sample, cue, bounds, from, to, busGain: admission.busGain });
        }
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  } finally {
    reader?.dispose();
    job.abort();
    signal?.removeEventListener('abort', abort);
    if (decoder && decoder.state !== 'closed') await decoder.close();
  }
}

type CueBatch =
  ReturnType<typeof iterateReviewActionAudioCues> extends Generator<infer T> ? T : never;
function mixCueWindow({
  output,
  sample,
  cue,
  bounds,
  from,
  to,
  busGain,
}: {
  output: AudioBuffer;
  sample: AudioBuffer;
  cue: CueBatch[number];
  bounds: { start: number; end: number };
  from: number;
  to: number;
  busGain: number;
}): void {
  const rate = output.sampleRate;
  const pcm = sample.getChannelData(0);
  const start = Math.max(bounds.start, cue.start),
    end = Math.min(bounds.end, cue.end);
  const first = Math.max(from, Math.ceil((start - bounds.start) * rate));
  const last = Math.min(to, Math.ceil((end - bounds.start) * rate));
  const fadeIn = start > cue.start ? Math.min(0.01, (end - start) / 4) : cue.fadeIn;
  const fadeOut = end < cue.end ? Math.min(0.01, (end - start) / 4) : cue.fadeOut;
  for (let frame = first; frame < last; frame++) {
    const time = bounds.start + frame / rate;
    const position = (cue.sourceOffset + time - cue.start) * sample.sampleRate;
    const left = Math.floor(position),
      fraction = position - left;
    if (left < 0 || left >= pcm.length) continue;
    const value = pcm[left]! + ((pcm[left + 1] ?? pcm[left]!) - pcm[left]!) * fraction;
    const envelope = Math.min(
      1,
      fadeIn > 0 ? (time - start) / fadeIn : 1,
      fadeOut > 0 ? (end - time) / fadeOut : 1
    );
    const gain = value * cue.volume * busGain * Math.max(0, envelope);
    for (let channel = 0; channel < output.numberOfChannels; channel++) {
      const plane = output.getChannelData(channel);
      plane[frame] = plane[frame]! + gain;
    }
  }
}
