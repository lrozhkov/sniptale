import { resolveProjectRenderScope } from '../../features/video/project/export/render-scope';
import { resolveProjectExportRange } from '../../features/video/project/export/range';
import { videoExportSampleWindows } from '../../features/video/project/export/size-estimate';
import type { VideoProject, VideoProjectExportSettings } from '../../features/video/project/types';
import { isSubtitleClip } from '../../features/video/project/timeline/presentation';
import { measureVideoExportSize } from '../../workflows/video/export-size';
import { createVideoPreviewFrameMaterializer } from '../preview/cache/materializer';

/** Isolated composition sampling never seeks the visible player or publishes output. */
export async function estimateProjectExportSize(args: {
  project: VideoProject;
  assetUrls: Record<string, string>;
  settings: VideoProjectExportSettings;
  signal: AbortSignal;
}) {
  const { settings, signal } = args;
  if (settings.frameRateMode === 'adaptive')
    throw new Error('Adaptive export size estimate is unavailable.');
  const scoped = resolveProjectRenderScope(args.project, settings);
  const project = settings.burnInSubtitles
    ? scoped
    : { ...scoped, clips: scoped.clips.filter((clip) => !isSubtitleClip(clip)) };
  const range = resolveProjectExportRange(project, settings);
  const windows = videoExportSampleWindows(range.duration, settings.fps);
  const codec =
    settings.format === 'MP4'
      ? settings.mp4VideoCodec === 'HEVC'
        ? 'hevc'
        : settings.mp4VideoCodec === 'VP9'
          ? 'vp9'
          : 'avc'
      : settings.webmVideoCodec === 'VP8'
        ? 'vp8'
        : 'vp9';
  const materializer = createVideoPreviewFrameMaterializer({
    project,
    sampleFps: settings.fps,
    assetUrls: args.assetUrls,
    ownerDocument: document,
    rasterSize: settings,
  });
  try {
    return await measureVideoExportSize({
      profile: {
        codec,
        width: settings.width,
        height: settings.height,
        fps: settings.fps,
        quality: settings.quality,
      },
      windows,
      duration: range.duration,
      audioBitrate: project.clips.some(
        (clip) =>
          !clip.muted &&
          'assetId' in clip &&
          project.assets.some((asset) => asset.id === clip.assetId && asset.metadata.hasAudio)
      )
        ? 192_000
        : 0,
      signal,
      async render(encode) {
        for (const window of windows) {
          const count = Math.ceil((window.end - window.start) * settings.fps - 1e-9);
          for (let i = 0; i < count; i++) {
            signal.throwIfAborted();
            const time = window.start + i / settings.fps;
            const canvas = await materializer.renderFrame(range.start + time, signal);
            const frame = new VideoFrame(canvas, {
              timestamp: Math.round(time * 1e6),
              duration: Math.round(Math.min(1 / settings.fps, window.end - time) * 1e6),
            });
            try {
              await encode(frame);
            } finally {
              frame.close();
            }
          }
        }
      },
    });
  } finally {
    materializer.dispose();
  }
}
