import { resolveVideoCompositionFrame } from '../../../../apps/extension/src/features/video/composition/timeline/frame';
import { drawCompositionVisualLayer } from '../../../../apps/extension/src/features/video/composition/draw/visual';
import { DEFAULT_CAMERA_APPEARANCE } from '../../../../apps/extension/src/features/video/project/camera/appearance';
import { DEFAULT_WINDOW_HEADER } from '@sniptale/runtime-contracts/window-header';
import {
  createVideoProjectFromRecording,
  createVideoProjectTrack,
} from '../../../../apps/extension/src/features/video/project/factories/creation';
import { createVideoProjectMotionRegion } from '../../../../apps/extension/src/features/video/project/motion';
import { bindMotionRegionToClip } from '../../../../apps/extension/src/features/video/project/motion/source-binding';
import { createQuickEditBorder } from '../../../../apps/extension/src/features/video/project/scene/focus-appearance';
import { drawProjectFrame } from '../../../../apps/extension/src/offscreen/project-export/renderer/frame';
import { renderPreviewScene } from '../../../../apps/extension/src/video-editor/preview/stage/scene/render-preview';
import { projectWindowHeaderImages } from '../../../../apps/extension/src/features/video/composition/draw/window-header';
import type { VideoProject } from '../../../../apps/extension/src/features/video/project/types';

/** Actual Native preview and export painters share footage, while landmarks have independent pixel expectations. */
export async function nativeBorderRasterProof(bytes: number[]) {
  const video = document.createElement('video');
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'video/webm' }));
  video.muted = true;
  video.src = url;
  document.body.append(video);
  await new Promise<void>((resolve, reject) => {
    video.onloadeddata = () => resolve();
    video.onerror = () => reject(new Error('Fixture decode failed.'));
  });
  video.currentTime = 1;
  await new Promise<void>((resolve) => {
    video.onseeked = () => resolve();
  });
  const results = [];
  const pixel = (canvas: HTMLCanvasElement, x: number, y: number) => [
    ...canvas.getContext('2d')!.getImageData(Math.floor(x), Math.floor(y), 1, 1).data,
  ];
  const canvas = (scale: number) => {
    const value = document.createElement('canvas');
    value.width = 320 * scale;
    value.height = 180 * scale;
    value.style.cssText = 'width:320px;height:180px;display:block';
    return value;
  };
  try {
    for (const mode of ['plain', 'header-crop', 'rotated', 'opacity', 'camera', 'circle'] as const)
      for (const raster of [1, 2]) {
        const project = createVideoProjectFromRecording({
          recordingId: 'border-proof',
          filename: 'border.webm',
          width: 160,
          height: 90,
          duration: 4,
          size: bytes.length,
          mimeType: 'video/webm',
        });
        project.width = 320;
        project.height = 180;
        project.duration = 4;
        project.version = 21;
        project.backgroundColor = '#000000';
        project.sceneBackground = { kind: 'solid', color: '#000000' };
        const clip = project.clips.find((value) => value.type === 'VIDEO');
        if (!clip || clip.type !== 'VIDEO') throw new Error('Missing video.');
        clip.fitMode = 'STRETCH';
        clip.windowCornerRadius = mode === 'header-crop' ? 12 : 0;
        clip.transform = {
          x: 48,
          y: 36,
          width: 128,
          height: 96,
          opacity: mode === 'opacity' ? 0.37 : 1,
          rotation: mode === 'rotated' ? 20 : 0,
        };
        if (mode === 'header-crop') {
          clip.windowHeader = { ...DEFAULT_WINDOW_HEADER, title: 'Window' };
          clip.sourceCrop = { x: 0.25, y: 0, width: 0.5, height: 1 };
        }
        if (mode === 'circle') {
          const sourceTrack = project.tracks.find((track) => track.id === clip.trackId)!;
          sourceTrack.role = 'CAMERA';
          clip.cameraAppearance = { ...DEFAULT_CAMERA_APPEARANCE, shape: 'circle' };
        }
        const track = createVideoProjectTrack('Independent', 1, 'PRIMARY');
        project.tracks.push(track);
        const other = {
          ...clip,
          id: 'independent',
          trackId: track.id,
          transform: { x: 196, y: 48, width: 80, height: 96, opacity: 1, rotation: 0 },
        };
        project.clips.push(other);
        const border = {
          ...createQuickEditBorder(),
          area: { x: 0, y: 0, width: 1, height: 1 },
          width: 4,
          color: '#ff0000ff',
          roundness: 0,
        };
        const window = bindMotionRegionToClip(
          {
            ...createVideoProjectMotionRegion(project, 0),
            id: 'window-border',
            duration: 4,
            border,
            borderTarget: 'window',
            phaseTransitions: { enter: 'none', exit: 'none' },
          },
          clip
        );
        const viewport = {
          ...createVideoProjectMotionRegion(project, 0),
          id: 'viewport-border',
          duration: 4,
          border: {
            ...border,
            color: '#00ff00ff',
            area: { x: 0.9, y: 0.1, width: 0.05, height: 0.8 },
          },
          borderTarget: 'viewport' as const,
          phaseTransitions: { enter: 'none' as const, exit: 'none' as const },
        };
        project.motionRegions = [window, viewport];
        if (mode === 'camera')
          project.motionRegions.push({
            ...createVideoProjectMotionRegion(project, 0),
            id: 'camera',
            duration: 4,
            scale: 1.5,
            focusPoint: { x: 160, y: 90 },
            phaseTransitions: { enter: 'none', exit: 'none' },
          });
        const images: Record<string, HTMLImageElement> = {};
        for (const descriptor of projectWindowHeaderImages(project)) {
          const image = new Image();
          image.src = descriptor.src;
          await image.decode();
          images[descriptor.key] = image;
        }
        const refs = { [clip.id]: video, [other.id]: video };
        const native = canvas(raster),
          exported = canvas(raster),
          baseline = canvas(raster),
          nativeBaseline = canvas(raster);
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;gap:8px;margin:8px';
        row.append(native, exported, nativeBaseline);
        document.body.append(row);
        const settings = {
          width: 320 * raster,
          height: 180 * raster,
          fps: 30,
          format: 'WEBM' as const,
          webmVideoCodec: 'VP9' as const,
          quality: 'MEDIUM' as const,
          resolution: 'SOURCE' as const,
          downloadAfterExport: false,
        };
        const sources = new Map(Object.entries(refs));
        drawProjectFrame(exported.getContext('2d')!, project, settings, 1, images, sources);
        const noBorders: VideoProject = {
          ...project,
          motionRegions: project.motionRegions.filter((region) => !region.border),
        };
        drawProjectFrame(baseline.getContext('2d')!, noBorders, settings, 1, images, sources);
        await renderPreviewScene({
          canvas: native,
          currentTime: 1,
          imageBank: images,
          project,
          stage: null,
          videoRefs: { current: refs },
          previewRasterSize: { width: 320 * raster, height: 180 * raster },
        });
        await renderPreviewScene({
          canvas: nativeBaseline,
          currentTime: 1,
          imageBank: images,
          project: noBorders,
          stage: null,
          videoRefs: { current: refs },
          previewRasterSize: { width: 320 * raster, height: 180 * raster },
        });
        const radians = (clip.transform.rotation * Math.PI) / 180;
        const point = { x: 112 + 46 * Math.sin(radians), y: 84 - 46 * Math.cos(radians) };
        const map = (value: { x: number; y: number }) =>
          mode === 'camera'
            ? { x: (value.x - 160) * 1.5 + 160, y: (value.y - 90) * 1.5 + 90 }
            : value;
        const at = map(point),
          independent = map({ x: 236, y: 50 });
        const a = native.getContext('2d')!.getImageData(0, 0, native.width, native.height).data;
        const b = exported
          .getContext('2d')!
          .getImageData(0, 0, exported.width, exported.height).data;
        const nativeBase = nativeBaseline
          .getContext('2d')!
          .getImageData(0, 0, nativeBaseline.width, nativeBaseline.height).data;
        const exportedBase = baseline
          .getContext('2d')!
          .getImageData(0, 0, baseline.width, baseline.height).data;
        let baselineDifference = 0;
        for (let i = 0; i < nativeBase.length; i++)
          baselineDifference = Math.max(
            baselineDifference,
            Math.abs(nativeBase[i]! - exportedBase[i]!)
          );
        let maxDifference = 0;
        for (let i = 0; i < a.length; i++)
          maxDifference = Math.max(maxDifference, Math.abs(a[i]! - b[i]!));
        const base = pixel(baseline, at.x * raster, at.y * raster);
        let translatedInput: { maxDifference: number; red: number[] } | undefined;
        if (mode === 'plain' && raster === 2) {
          const layer = resolveVideoCompositionFrame(project, 1).visualLayers.find(
            (layer) => layer.clipId === clip.id
          );
          if (!layer || layer.kind !== 'video') throw new Error('Missing window layer.');
          const shifted = document.createElement('canvas'),
            reference = document.createElement('canvas');
          shifted.width = reference.width = 256;
          shifted.height = reference.height = 192;
          const a = shifted.getContext('2d')!,
            b = reference.getContext('2d')!;
          a.scale(2, 2);
          a.translate(-1000, -500);
          b.scale(2, 2);
          drawCompositionVisualLayer(
            a,
            {
              ...layer,
              x: 1000,
              y: 500,
              clip: { ...clip, transform: { ...clip.transform, x: 1000, y: 500 } },
            },
            1,
            1,
            images,
            sources
          );
          drawCompositionVisualLayer(
            b,
            {
              ...layer,
              x: 0,
              y: 0,
              clip: { ...clip, transform: { ...clip.transform, x: 0, y: 0 } },
            },
            1,
            1,
            images,
            sources
          );
          const shiftedPixels = a.getImageData(0, 0, 256, 192).data,
            referencePixels = b.getImageData(0, 0, 256, 192).data;
          let difference = 0;
          for (let i = 0; i < shiftedPixels.length; i++)
            difference = Math.max(difference, Math.abs(shiftedPixels[i]! - referencePixels[i]!));
          translatedInput = { maxDifference: difference, red: pixel(shifted, 128, 4) };
        }
        results.push({
          mode,
          raster,
          maxDifference,
          baselineDifference,
          translatedInput,
          red: pixel(native, at.x * raster, at.y * raster),
          expectedRed: base.map((value, channel) =>
            channel === 3
              ? 255
              : Math.round(
                  value * (1 - clip.transform.opacity) +
                    (channel === 0 ? 255 : 0) * clip.transform.opacity
                )
          ),
          green: pixel(native, 296 * raster, 20 * raster),
          independent: pixel(native, independent.x * raster, independent.y * raster),
          independentBaseline: pixel(baseline, independent.x * raster, independent.y * raster),
        });
      }
  } finally {
    video.remove();
    URL.revokeObjectURL(url);
  }
  return results;
}
