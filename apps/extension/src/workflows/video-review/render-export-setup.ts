import { reviewWatermarkAssets } from './asset-bytes';
import type { EncodedPacket } from 'mediabunny';
import type { ReviewFrameExportInput } from './render-export-input';
import { reviewFrameDecorations } from './render-export-input';
import { createReviewPresentationMain } from './presentation-main';
import {
  createWatermarkRenderer,
  type WatermarkRenderer,
} from '../../features/video/composition/canvas/watermark';
import { createReviewWebcamRenderer } from './render-webcam';
import { prepareReviewFinalCaptions } from './render-captions';
import { createReviewMediaOutput } from './media-output';
import {
  resolveReviewRenderBitrate,
  resolveReviewVideoEncoderConfig,
  type ReviewRenderPreparation,
} from './render-settings';
import { cleanupReviewExportFailure } from './export-diagnostics';

type Dimensions = Parameters<typeof createReviewPresentationMain>[0]['dimensions'];

/** Transfers successful decoration handles to the frame exporter; compensates partial acquisition. */
export async function prepareReviewFrameDecorations(
  args: ReviewFrameExportInput,
  preparation: ReviewRenderPreparation,
  source: { dimensions: Dimensions; sourceSize: { width: number; height: number } }
) {
  let main: Awaited<ReturnType<typeof createReviewPresentationMain>> | null = null;
  let watermark: WatermarkRenderer | null = null;
  let webcam: Awaited<ReturnType<typeof createReviewWebcamRenderer>> | null = null;
  try {
    if (preparation.effective.annotationEffects)
      main = await createReviewPresentationMain({
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
      });
    if (!main) {
      watermark = await createWatermarkRenderer(
        preparation.effective.watermark,
        source.dimensions.backing,
        reviewWatermarkAssets(args.readProjectAsset),
        args.signal
      );
      if (preparation.effective.captions && args.fragmentOffset > 0 && !args.captionTimeMap)
        throw new Error('Fragment captions require the full document time map.');
      if (preparation.effective.webcam)
        webcam = await createReviewWebcamRenderer(
          preparation.effective.webcam,
          args.readProjectAsset,
          args.signal
        );
    }
    const captions = main
      ? undefined
      : await prepareReviewFinalCaptions({
          input: args,
          effective: preparation.effective,
          source: { size: source.sourceSize, output: source.dimensions.backing },
          webcamDuration: webcam?.duration,
          watermarkBounds: watermark!.bounds,
          resultDuration: preparation.windows.at(-1)!.segment.resultEnd,
        });
    return { main, watermark, webcam, captions };
  } catch (error) {
    return await cleanupReviewExportFailure(error, () => {
      webcam?.dispose();
      watermark?.dispose();
      main?.dispose();
    });
  }
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
