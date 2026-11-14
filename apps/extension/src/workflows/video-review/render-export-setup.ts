import type { EncodedPacket } from 'mediabunny';
import type { ReviewFrameExportInput } from './render-export-input';
import { reviewFrameDecorations } from './render-export-input';
import { createReviewPresentationMain } from './presentation-main';
import { createReviewMediaOutput } from './media-output';
import {
  resolveReviewRenderBitrate,
  resolveReviewVideoEncoderConfig,
  type ReviewRenderPreparation,
} from './render-settings';
import type { ExportEnhancer } from '../../features/video/composition/export-enhancement/enhancer';

type Dimensions = Parameters<typeof createReviewPresentationMain>[0]['dimensions'];

/** Opens the shared composition owner; encoding and audio remain with the export job. */
export async function prepareReviewFrameDecorations(
  args: ReviewFrameExportInput,
  preparation: ReviewRenderPreparation,
  source: { dimensions: Dimensions; sourceSize: { width: number; height: number } },
  exportEnhancer?: ExportEnhancer
) {
  return {
    main: await createReviewPresentationMain({
      renderer: 'gpu',
      transitionFrameRetention: 'transition',
      *plannedMainTimes() {
        for (const window of preparation.windows) yield* window.timestamps;
      },
      ...(exportEnhancer ? { exportEnhancer } : {}),
      file: args.file,
      index: args.index,
      edits: args.edits,
      ...(args.captionTimeMap ? { captionTimeMap: args.captionTimeMap } : {}),
      ...(args.effectSnapshots ? { effectSnapshots: args.effectSnapshots } : {}),
      fps: preparation.fps,
      effective: preparation.effective,
      ...reviewFrameDecorations(args),
      fragmentOffset: args.fragmentOffset,
      dimensions: source.dimensions,
      readAsset: args.readProjectAsset,
      signal: args.signal,
    }),
  };
}

/** Native encoder settings use admitted backing geometry; the caller retains muxer ownership. */
export function createReviewFrameOutput(
  args: ReviewFrameExportInput,
  preparation: ReviewRenderPreparation,
  source: { dimensions: Dimensions; processedAudio: 'aac' | 'opus' | null },
  onAudioPacket: (packet: EncodedPacket) => void
) {
  return args.frameProbe
    ? null
    : createReviewMediaOutput({
        index: args.index,
        container: preparation.container,
        processedAudio: source.processedAudio,
        writer: args.writer,
        signal: args.signal,
        ...(args.provenance ? { provenance: args.provenance } : {}),
        sampleVideo: {
          codec: preparation.codec,
          quality: preparation.quality,
          fullCodecString: resolveReviewVideoEncoderConfig(preparation.codec, {
            ...source.dimensions.backing,
            fps: preparation.fps,
          }).codec,
          frameRate: preparation.fps,
          frameRateMode: args.renderSettings?.frameRateMode,
          bitrate: resolveReviewRenderBitrate(
            { fps: preparation.fps, ...source.dimensions.backing },
            args.renderSettings?.quality
          ),
        },
        onAudioPacket,
      });
}
