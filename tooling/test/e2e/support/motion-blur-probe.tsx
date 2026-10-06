import {
  createEmptyVideoProject,
  createVideoProjectTrack,
} from '../../../../apps/extension/src/features/video/project/factories/creation';
import { createVideoClipFromAsset } from '../../../../apps/extension/src/features/video/project/factories/clip';
import {
  VideoProjectAssetType,
  VideoTrackKind,
  VideoMotionFocusMode,
  VideoTemporalEasing,
  VideoExportFormat,
  VideoExportQualityPreset,
} from '../../../../apps/extension/src/features/video/project/types';
import { drawProjectFrame } from '../../../../apps/extension/src/offscreen/project-export/renderer/frame';
import { resolveVideoCompositionRenderPasses } from '../../../../apps/extension/src/features/video/composition/timeline/render';
import { drawPreviewVisualPasses } from '../../../../apps/extension/src/video-editor/preview/stage/scene/render-visual';

/** Pixel proof uses real painters: an opaque red layer must occlude the blue layer beneath it. */
export async function fullEditorOcclusion() {
  const project = createEmptyVideoProject('Motion blur proof', 320, 180);
  project.duration = 5;
  const images: Record<string, HTMLImageElement> = {};
  for (const [index, color] of ['#ff0000', '#0000ff'].entries()) {
    const image = new Image();
    image.src = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="${color}"/></svg>`)}`;
    await image.decode();
    const id = `image-${index}`;
    images[id] = image;
    const track = createVideoProjectTrack(id, index + 1, VideoTrackKind.PRIMARY);
    project.tracks.push(track);
    const asset = {
      id,
      name: id,
      type: VideoProjectAssetType.IMAGE,
      createdAt: 1,
      source: { kind: 'project-asset' as const, projectAssetId: id },
      metadata: {
        width: 320,
        height: 180,
        duration: 5,
        hasAudio: false,
        mimeType: 'image/svg+xml',
        size: 1,
        audioPeaks: null,
      },
    };
    project.assets.push(asset);
    project.clips.push(createVideoClipFromAsset(track.id, asset, 320, 180, 0));
  }
  project.motionRegions = [
    {
      id: 'zoom',
      startTime: 0,
      duration: 5,
      scale: 2,
      focusPoint: { x: 160, y: 90 },
      focusMode: VideoMotionFocusMode.MANUAL,
      easing: VideoTemporalEasing.LINEAR,
      targetAction: null,
      zoomInDuration: 2,
      zoomOutDuration: 1,
      motionBlurAmount: 0.75,
    },
  ];
  const results = [];
  for (const blurred of [false, true]) {
    project.motionRegions[0]!.motionBlurAmount = blurred ? 0.75 : 0;
    for (const preview of [false, true]) {
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 180;
      canvas.style.cssText = 'width:320px;height:180px;display:block';
      document.body.append(canvas);
      const context = canvas.getContext('2d')!;
      if (preview) {
        const passes = resolveVideoCompositionRenderPasses(project, 1);
        drawPreviewVisualPasses({
          canvas,
          project,
          stage: null,
          currentTime: 1,
          imageBank: images,
          clipMediaElements: new Map(),
          overlayFrame: passes.overlayFrame,
          passes: passes.visualPasses,
        });
      } else {
        drawProjectFrame(
          context,
          project,
          {
            width: 320,
            height: 180,
            fps: 30,
            format: VideoExportFormat.MP4,
            resolution: 'SOURCE',
            mp4VideoCodec: 'AVC',
            quality: VideoExportQualityPreset.MEDIUM,
            downloadAfterExport: false,
          },
          1,
          images,
          new Map()
        );
      }
      results.push({
        blurred,
        preview,
        pixel: Array.from(context.getImageData(canvas.width / 2, canvas.height / 2, 1, 1).data),
      });
    }
  }
  return results;
}

import {
  computeQuickEditSceneLayout,
  evaluateQuickEditCameraAtTime,
} from '../../../../apps/extension/src/features/video/review/advanced/scene';
import { quickEditMotionBlurCameras } from '../../../../apps/extension/src/features/video/review/advanced/motion-blur';
import { drawReviewSceneFrame } from '../../../../apps/extension/src/workflows/video-review/scene-frame';
import type {
  QuickEditZoomRegion,
  QuickEditBackgroundSettings,
} from '../../../../apps/extension/src/features/video/review/advanced/types';

/** Actual quick-export painter, sampled at 30 FPS, with a decorated high-contrast source. */
export function quickSceneExposure() {
  const source = document.createElement('canvas');
  source.width = 320;
  source.height = 180;
  const sourceContext = source.getContext('2d')!;
  sourceContext.fillStyle = '#ffffff';
  sourceContext.fillRect(0, 0, 320, 180);
  sourceContext.fillStyle = '#000000';
  sourceContext.fillRect(220, 0, 100, 180);
  const header = document.createElement('canvas');
  header.width = 320;
  header.height = 36;
  header.getContext('2d')!.fillRect(0, 0, 320, 36);
  const amount = { enabled: true, strength: 0.8 };
  const first: QuickEditZoomRegion = {
    id: 'a',
    start: 0,
    end: 3,
    linkTo: 'b',
    transform: { scale: 1.5, centerX: 0.5, centerY: 0.5 },
    enter: { type: 'linear', duration: 1 },
    exit: { type: 'linear', duration: 1 },
    motionBlur: { enter: amount, exit: amount, link: amount },
  };
  const second: QuickEditZoomRegion = {
    ...first,
    id: 'b',
    start: 6,
    end: 9,
    transform: { ...first.transform, scale: 1.15 },
  };
  delete second.linkTo;
  const regions = [first, second];
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 432;
  document.body.append(canvas);
  const context = canvas.getContext('2d')!;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  const results = [];
  for (const follows of [false, true]) {
    const background: QuickEditBackgroundSettings = {
      enabled: true,
      type: 'solid',
      color: '#404040',
      zoomBehavior: follows ? 'follow-video' : 'fixed',
      layout: { padding: 10, cornerRadius: 12, shadow: { intensity: 0.4, color: '#000000' } },
    };
    for (const time of [0.5, 2, ...Array.from({ length: 15 }, (_, frame) => 4 + frame / 30), 8.5]) {
      const camera = evaluateQuickEditCameraAtTime(regions, time);
      const layout = computeQuickEditSceneLayout({
        source,
        output: canvas,
        camera,
        background,
        windowHeader: { kind: 'browser', title: 'Proof', url: '' },
      });
      const paint = (blurred: boolean) => {
        drawReviewSceneFrame(context, {
          canvas,
          layout,
          background: { ...background, layout: { ...background.layout, cornerRadius: 24 } },
          image: null,
          headerImage: header,
          sceneScale: 2,
          sample: {
            draw: (target, x, y, width, height) => target.drawImage(source, x, y, width, height),
          },
          motionBlur: blurred ? quickEditMotionBlurCameras(regions, time) : undefined,
        });
        return context.getImageData(0, 0, canvas.width, canvas.height).data;
      };
      const plain = paint(false);
      const blur = paint(true);
      let changed = 0,
        opacityLoss = 0;
      for (let i = 0; i < plain.length; i += 4) {
        if (Math.abs(plain[i]! - blur[i]!) > 2) changed++;
        if (blur[i + 3] !== 255) opacityLoss++;
      }
      results.push({ follows, time, changed, opacityLoss });
    }
  }
  const start = performance.now();
  for (let n = 0; n < 60; n++) {
    const time = 3.5 + n / 30;
    const camera = evaluateQuickEditCameraAtTime(regions, time);
    const layout = computeQuickEditSceneLayout({
      source,
      output: canvas,
      camera,
      background: { enabled: false },
    });
    drawReviewSceneFrame(context, {
      canvas,
      layout,
      background: { enabled: false },
      image: null,
      sample: {
        draw: (target, x, y, width, height) => target.drawImage(source, x, y, width, height),
      },
      motionBlur: quickEditMotionBlurCameras(regions, time),
    });
  }
  context.getImageData(0, 0, 1, 1);
  return { results, millisecondsPerFrame: (performance.now() - start) / 60 };
}
