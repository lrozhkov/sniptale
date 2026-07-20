import type { VideoProject } from '../../../../features/video/project/types/index';
import { decodeEffectAudio } from '../../../../features/video/composition/effect-runtime/media/decode';
import type { EffectAudioBufferCache } from '../../../../features/video/composition/effect-runtime/audio/buffer-cache';
import type { OfflineAudioRenderableClip } from './types';
import { loadBlobForAsset } from './load';

interface AudioDecodeContext<TBuffer> {
  decodeAudioData(bytes: ArrayBuffer): Promise<TBuffer>;
}

interface DecodedAudioShape {
  length: number;
  numberOfChannels: number;
  sampleRate: number;
}

export async function decodeClipAudioBuffer<TBuffer extends DecodedAudioShape>(
  project: VideoProject,
  clip: OfflineAudioRenderableClip,
  decodedBuffers: EffectAudioBufferCache<TBuffer>,
  decodeContext: AudioDecodeContext<TBuffer>
): Promise<TBuffer> {
  const effectClip = isEffectAudioClip(clip);
  const cacheKey = effectClip ? clip.assetCacheKey : clip.assetId;
  return decodedBuffers.loadOrDecode(cacheKey, async () => {
    const blob = effectClip ? clip.assetBlob : await loadBlobForAsset(project, clip.assetId);
    return effectClip
      ? decodeEffectAudio(blob, clip.assetMimeType, (bytes) => decodeContext.decodeAudioData(bytes))
      : decodeContext.decodeAudioData((await blob.arrayBuffer()).slice(0));
  });
}

function isEffectAudioClip(
  clip: OfflineAudioRenderableClip
): clip is Extract<OfflineAudioRenderableClip, { sourceKind: 'effect-snapshot' }> {
  return 'sourceKind' in clip && clip.sourceKind === 'effect-snapshot';
}
