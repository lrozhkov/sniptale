import { encodeOfflineAudioBuffer } from '../offline-audio';
import type { createMp4Pipeline } from './pipeline/index';

export async function encodeMp4AudioIfPresent(args: {
  audioEncoder: AudioEncoder | null;
  pipeline: Awaited<ReturnType<typeof createMp4Pipeline>>;
  signal?: AbortSignal;
  throwIfPipelineFailed: () => void;
}) {
  if (!args.audioEncoder || !args.pipeline.mixedAudio) {
    return;
  }

  await encodeOfflineAudioBuffer(
    args.pipeline.mixedAudio.buffer,
    args.pipeline.mixedAudio.settings,
    args.audioEncoder,
    args.throwIfPipelineFailed,
    args.signal
  );
}
