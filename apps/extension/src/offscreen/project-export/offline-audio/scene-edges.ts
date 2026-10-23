import {
  presentationEnvelopeOpacity,
  resolveVideoProjectSceneEdgePlan,
} from '../../../features/video/project/scene/edge-fades';
import type { VideoProject } from '../../../features/video/project/types';

/** Applies the scene envelope once after all clip, effect and action audio has mixed. */
export async function applyOfflineSceneEdgeGain(
  output: AudioBuffer,
  project: VideoProject,
  start: number,
  signal?: AbortSignal
): Promise<void> {
  signal?.throwIfAborted();
  const envelope = resolveVideoProjectSceneEdgePlan(
    project,
    project.fps,
    output.sampleRate
  ).audioEnvelope;
  if (envelope.fadeIn === 0 && envelope.fadeOut === 0) return;
  const channels = Array.from({ length: output.numberOfChannels }, (_, channel) =>
    output.getChannelData(channel)
  );
  const blockSize = Math.max(1, Math.floor(output.sampleRate * 8));
  for (let from = 0; from < output.length; from += blockSize) {
    signal?.throwIfAborted();
    const to = Math.min(output.length, from + blockSize);
    for (let frame = from; frame < to; frame++) {
      const gain = 1 - presentationEnvelopeOpacity(envelope, start + frame / output.sampleRate);
      for (const channel of channels) channel[frame] = channel[frame]! * gain;
    }
    if (to < output.length) await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  signal?.throwIfAborted();
}
