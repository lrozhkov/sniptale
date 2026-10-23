import { drawCompositionVisualLayer } from '../../../../apps/extension/src/features/video/composition/draw/visual';
import { resolveVideoCompositionFrame } from '../../../../apps/extension/src/features/video/composition/timeline/frame';
import { createVideoProjectFromRecording } from '../../../../apps/extension/src/features/video/project/factories/creation';
import { createVideoProjectMotionRegion } from '../../../../apps/extension/src/features/video/project/motion';
import { bindMotionRegionToClip } from '../../../../apps/extension/src/features/video/project/motion/source-binding';
import { createQuickEditSpotlight } from '../../../../apps/extension/src/features/video/project/scene/focus-appearance';
import { drawProjectFrame } from '../../../../apps/extension/src/offscreen/project-export/renderer/frame';
import { renderPreviewScene } from '../../../../apps/extension/src/video-editor/preview/stage/scene/render-preview';
import { createReviewSpatialRenderer } from '../../../../apps/extension/src/features/video/composition/canvas/spatial-renderer';
import { DEFAULT_CAMERA_PERSPECTIVE } from '../../../../apps/extension/src/features/video/project/motion/spatial';
import { DEFAULT_WINDOW_HEADER } from '@sniptale/runtime-contracts/window-header';
import { projectWindowHeaderImages } from '../../../../apps/extension/src/features/video/composition/draw/window-header';
/** Real Native video drawing compares independent pixels against an unchanged lower track. */
export function nativeWindowSpotlightProof() {
  const board = document.createElement('section');
  board.style.cssText = 'display:grid;grid-template-columns:repeat(2,520px);gap:12px';
  document.body.append(board);
  const canvas = (raster = 1) => {
    const value = document.createElement('canvas');
    value.width = 320 * raster;
    value.height = 180 * raster;
    value.dataset.raster = String(raster);
    value.style.cssText = 'width:240px;height:135px;display:block';
    return value;
  };
  const pixel = (value: HTMLCanvasElement, x: number, y: number) => [
    ...value
      .getContext('2d')!
      .getImageData(x * Number(value.dataset.raster), y * Number(value.dataset.raster), 1, 1).data,
  ];
  const results = [];
  for (const raster of [1, 2])
    for (const mode of ['dim', 'blur-uniform', 'blur-detail', 'union'] as const) {
      const project = createVideoProjectFromRecording({
        recordingId: 'window-source',
        filename: 'window.webm',
        width: 160,
        height: 120,
        duration: 4,
        size: 10,
        mimeType: 'video/webm',
      });
      project.width = 320;
      project.height = 180;
      project.duration = 4;
      const clip = project.clips.find((item) => item.type === 'VIDEO')!;
      clip.fitMode = 'STRETCH';
      clip.windowCornerRadius = 0;
      clip.shadowIntensity = 0;
      clip.transform = { x: 80, y: 30, width: 160, height: 120, opacity: 0.5, rotation: 0 };
      const source = canvas();
      source.width = 160;
      source.height = 120;
      const sourceContext = source.getContext('2d')!;
      sourceContext.fillStyle = '#f0f0f0';
      sourceContext.fillRect(0, 0, 160, 120);
      if (mode === 'blur-detail')
        for (let x = 0; x < 160; x += 4) {
          sourceContext.fillStyle = '#101010';
          sourceContext.fillRect(x, 0, 2, 120);
        }
      const media = new Map([
        [
          clip.id,
          {
            sourceWidth: 160,
            sourceHeight: 120,
            draw: (
              context: CanvasRenderingContext2D,
              x: number,
              y: number,
              width: number,
              height: number
            ) => context.drawImage(source, x, y, width, height),
          },
        ],
      ]);
      const baseline = canvas(raster),
        actual = canvas(raster),
        isolatedBaseline = canvas(raster);
      const paint = (output: HTMLCanvasElement) => {
        const context = output.getContext('2d')!;
        context.scale(raster, raster);
        for (let x = 0; x < 320; x += 4) {
          context.fillStyle = x % 8 === 0 ? '#204060' : '#a0c0e0';
          context.fillRect(x, 0, 4, 180);
        }
        for (const layer of resolveVideoCompositionFrame(project, 2).visualLayers)
          drawCompositionVisualLayer(context, layer, 1, 1, {}, media);
      };
      paint(baseline);
      const region = bindMotionRegionToClip(
        {
          ...createVideoProjectMotionRegion(project, 0),
          duration: 4,
          spotlight: {
            ...createQuickEditSpotlight(),
            effect: mode.startsWith('blur') ? 'blur' : 'dim',
            strength: 0.6,
            blur: 8,
            area: { x: 0.375, y: 0.25, width: 0.25, height: 0.5 },
            roundness: 0,
          },
          spotlightTarget: 'window',
        },
        clip
      );
      project.motionRegions = [region];
      if (mode === 'union')
        project.motionRegions.push({
          ...region,
          id: 'second-opening',
          spotlight: {
            ...region.spotlight!,
            strength: 0.8,
            area: { x: 0.05, y: 0.25, width: 0.1, height: 0.5 },
          },
        });
      const acceptedRegions = project.motionRegions;
      project.motionRegions = acceptedRegions.map((item) => ({
        ...item,
        spotlight: { ...item.spotlight!, effect: 'dim', strength: 0 },
      }));
      paint(isolatedBaseline);
      project.motionRegions = acceptedRegions;
      paint(actual);
      let outsideDifference = 0;
      const left = baseline.getContext('2d')!.getImageData(0, 0, 320 * raster, 180 * raster).data;
      const right = actual.getContext('2d')!.getImageData(0, 0, 320 * raster, 180 * raster).data;
      for (let y = 0; y < 180 * raster; y++)
        for (let x = 0; x < 320 * raster; x++) {
          if (x >= 80 * raster && x < 240 * raster && y >= 30 * raster && y < 150 * raster)
            continue;
          for (let channel = 0; channel < 4; channel++)
            outsideDifference = Math.max(
              outsideDifference,
              Math.abs(
                left[(y * 320 * raster + x) * 4 + channel]! -
                  right[(y * 320 * raster + x) * 4 + channel]!
              )
            );
        }
      const contrast = (output: HTMLCanvasElement) =>
        Math.abs(pixel(output, 100, 80)[0]! - pixel(output, 102, 80)[0]!);
      results.push({
        mode,
        raster,
        outsideDifference,
        opening: pixel(actual, 160, 80),
        baselineOpening: pixel(baseline, 160, 80),
        isolatedOpening: pixel(isolatedBaseline, 160, 80),
        outsideOpening: pixel(actual, 112, 80),
        baselineOutsideOpening: pixel(baseline, 112, 80),
        secondOpening: pixel(actual, 96, 80),
        baselineSecondOpening: pixel(baseline, 96, 80),
        baselineContrast: contrast(baseline),
        actualContrast: contrast(actual),
      });
      const row = document.createElement('div');
      row.style.cssText = 'display:grid;grid-template-columns:240px 240px;gap:6px';
      const label = document.createElement('div');
      label.textContent = `${mode} · DPR ${raster}`;
      label.style.gridColumn = '1 / -1';
      row.append(label, baseline, actual);
      board.append(row);
    }
  return results;
}

/** Native preview/export pixels use an independent output-to-opening classifier. */
export async function nativeSceneSpotlightRasterProof(bytes: number[]) {
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'video/webm' }));
  const video = document.createElement('video');
  video.muted = true;
  video.src = url;
  document.body.append(video);
  const board = document.createElement('section');
  board.style.cssText = 'display:grid;grid-template-columns:repeat(4,280px);gap:8px';
  document.body.append(board);
  const results = [];
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error('Fixture decode failed.'));
    });
    await new Promise<void>((resolve) => {
      video.onseeked = () => resolve();
      video.currentTime = 1;
    });
    for (const raster of [1, 2])
      for (const mode of [
        'canvas',
        'scene',
        'rotated',
        'zoom',
        'opacity',
        'ellipse',
        'header-crop',
        'perspective',
        'scene-blur',
      ] as const) {
        const project = createVideoProjectFromRecording({
          recordingId: 'source',
          filename: 'source.webm',
          width: 160,
          height: 90,
          duration: 4,
          size: bytes.length,
          mimeType: 'video/webm',
        });
        project.width = 320;
        project.height = 180;
        project.duration = 4;
        project.version = 22;
        project.backgroundColor = '#e0e0e0';
        project.sceneBackground = { kind: 'solid', color: '#e0e0e0' };
        const clip = project.clips.find((item) => item.type === 'VIDEO')!;
        clip.fitMode = 'STRETCH';
        clip.windowCornerRadius = 0;
        clip.shadowIntensity = 0;
        clip.transform = {
          x: 60,
          y: 30,
          width: 160,
          height: 90,
          rotation: mode === 'rotated' ? 27 : 0,
          opacity: mode === 'opacity' ? 0.37 : 1,
        };
        if (mode === 'header-crop') {
          clip.windowHeader = DEFAULT_WINDOW_HEADER;
          clip.sourceCrop = { x: 0.2, y: 0.1, width: 0.6, height: 0.8 };
        }
        if (mode === 'ellipse') {
          project.tracks.find((track) => track.id === clip.trackId)!.role = 'CAMERA';
          clip.cameraAppearance = { shape: 'ellipse', roundness: 0, zoom: 1, panX: 0, panY: 0 };
        }
        const spotlight = bindMotionRegionToClip(
          {
            ...createVideoProjectMotionRegion(project, 0),
            duration: 4,
            spotlight: {
              ...createQuickEditSpotlight(),
              strength: 0.6,
              roundness: 0,
              effect: mode === 'scene-blur' ? 'blur' : 'dim',
              ...(mode === 'ellipse' ? { area: { x: 0, y: 0, width: 1, height: 1 } } : {}),
            },
            spotlightTarget: mode === 'canvas' ? 'viewport' : 'scene',
            phaseTransitions: { enter: 'none', exit: 'none' },
          },
          clip
        );
        project.motionRegions = [spotlight];
        if (mode === 'canvas' || mode === 'zoom' || mode === 'ellipse' || mode === 'perspective')
          project.motionRegions.push({
            ...createVideoProjectMotionRegion(project, 0),
            id: 'camera',
            duration: 4,
            scale: mode === 'perspective' ? 1 : 1.5,
            focusPoint: { x: 160, y: 90 },
            phaseTransitions: { enter: 'none', exit: 'none' },
            ...(mode === 'perspective'
              ? { perspective: { ...DEFAULT_CAMERA_PERSPECTIVE, enabled: true, rotateY: 35 } }
              : {}),
          });
        const images: Record<string, HTMLImageElement> = {};
        for (const descriptor of projectWindowHeaderImages(project)) {
          const image = new Image();
          image.src = descriptor.src;
          await image.decode();
          images[descriptor.key] = image;
        }
        const canvas = () => {
          const value = document.createElement('canvas');
          value.width = 320 * raster;
          value.height = 180 * raster;
          value.style.cssText = 'width:320px;height:180px';
          return value;
        };
        const preview = canvas(),
          exported = canvas(),
          baseline = canvas();
        const row = document.createElement('div');
        const label = document.createElement('div');
        label.textContent = `${mode} · raster ${raster}`;
        row.append(label, preview, exported);
        board.append(row);
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
        const renderer = mode === 'perspective' ? createReviewSpatialRenderer() : null;
        try {
          const spatial = renderer ? { spatialRenderer: () => renderer } : {};
          const sources = new Map([[clip.id, video]]);
          drawProjectFrame(
            exported.getContext('2d')!,
            project,
            settings,
            1,
            images,
            sources,
            spatial
          );
          const noSpotlight = {
            ...project,
            motionRegions: project.motionRegions.filter((region) => !region.spotlight),
          };
          drawProjectFrame(
            baseline.getContext('2d')!,
            noSpotlight,
            settings,
            1,
            images,
            sources,
            spatial
          );
          const painted = await renderPreviewScene({
            canvas: preview,
            currentTime: 1,
            imageBank: images,
            project,
            stage: null,
            videoRefs: { current: { [clip.id]: video } },
            previewRasterSize: { width: 320 * raster, height: 180 * raster },
            ...spatial,
          });
          if (painted === false) throw new Error('Native preview did not draw.');
          const a = preview
            .getContext('2d')!
            .getImageData(0, 0, preview.width, preview.height).data;
          const b = exported
            .getContext('2d')!
            .getImageData(0, 0, exported.width, exported.height).data;
          const base = baseline
            .getContext('2d')!
            .getImageData(0, 0, baseline.width, baseline.height).data;
          let runtimeDifference = 0,
            insideDifference = 0,
            outsideDifference = 0,
            inside = 0,
            outside = 0;
          for (let i = 0; i < a.length; i++)
            runtimeDifference = Math.max(runtimeDifference, Math.abs(a[i]! - b[i]!));
          for (let y = 4; y < 176; y += 4)
            for (let x = 4; x < 316; x += 4) {
              let localX = x + 0.5 / raster,
                localY = y + 0.5 / raster;
              if (mode === 'zoom') {
                localX = (localX - 160) / 1.5 + 160;
                localY = (localY - 90) / 1.5 + 90;
              }
              if (mode === 'perspective') {
                // Inverse ray/plane intersection for a 35-degree yaw about the canvas center.
                const angle = (35 * Math.PI) / 180,
                  focal = (0.7 * 0.5) / Math.hypot(320, 180);
                const dx =
                  (localX - 160) / (Math.cos(angle) - (localX - 160) * focal * Math.sin(angle));
                localY = 90 + (localY - 90) * (1 + focal * Math.sin(angle) * dx);
                localX = 160 + dx;
              }
              if (mode === 'rotated') {
                const angle = (-27 * Math.PI) / 180,
                  dx = localX - 140,
                  dy = localY - 75;
                localX = 140 + dx * Math.cos(angle) - dy * Math.sin(angle);
                localY = 75 + dx * Math.sin(angle) + dy * Math.cos(angle);
              }
              let protectedPoint: boolean;
              if (mode === 'ellipse') {
                const distance = ((localX - 140) / 80) ** 2 + ((localY - 75) / 45) ** 2;
                if (Math.abs(distance - 1) < 0.15) continue;
                protectedPoint = distance < 1;
              } else {
                const hole =
                  mode === 'canvas'
                    ? { x: 80, y: 45, width: 160, height: 90 }
                    : { x: 100, y: 52.5, width: 80, height: 45 };
                if (
                  (Math.abs(localX - hole.x) < 3 || Math.abs(localX - hole.x - hole.width) < 3) &&
                  localY > hole.y - 3 &&
                  localY < hole.y + hole.height + 3
                )
                  continue;
                if (
                  (Math.abs(localY - hole.y) < 3 || Math.abs(localY - hole.y - hole.height) < 3) &&
                  localX > hole.x - 3 &&
                  localX < hole.x + hole.width + 3
                )
                  continue;
                protectedPoint =
                  localX > hole.x &&
                  localX < hole.x + hole.width &&
                  localY > hole.y &&
                  localY < hole.y + hole.height;
              }
              const offset = (y * raster * exported.width + x * raster) * 4;
              const factor = protectedPoint ? 1 : 1 - 0.6 * (mode === 'opacity' ? 0.37 : 1);
              for (let channel = 0; channel < 3; channel++) {
                const difference = Math.abs(
                  b[offset + channel]! - Math.round(base[offset + channel]! * factor)
                );
                if (protectedPoint) insideDifference = Math.max(insideDifference, difference);
                else if (mode !== 'scene-blur')
                  outsideDifference = Math.max(outsideDifference, difference);
              }
              if (protectedPoint) inside++;
              else outside++;
            }
          let baselineEnergy = 0,
            actualEnergy = 0,
            energySamples = 0;
          if (mode === 'scene-blur')
            for (let y = 40; y < 110; y += 2)
              for (let x = 65; x < 214; x++) {
                if (x > 96 && x < 184 && y > 49 && y < 101) continue;
                const offset = (y * raster * exported.width + x * raster) * 4;
                for (let channel = 0; channel < 3; channel++) {
                  baselineEnergy += Math.abs(
                    base[offset + channel]! - base[offset + raster * 4 + channel]!
                  );
                  actualEnergy += Math.abs(
                    b[offset + channel]! - b[offset + raster * 4 + channel]!
                  );
                }
                energySamples++;
              }
          results.push({
            mode,
            raster,
            runtimeDifference,
            insideDifference,
            outsideDifference,
            inside,
            outside,
            baselineEnergy: baselineEnergy / Math.max(1, energySamples),
            actualEnergy: actualEnergy / Math.max(1, energySamples),
          });
          preview.style.cssText = exported.style.cssText = 'width:128px;height:72px';
        } finally {
          renderer?.dispose();
        }
      }
    return results;
  } finally {
    video.pause();
    video.removeAttribute('src');
    video.load();
    video.remove();
    URL.revokeObjectURL(url);
  }
}
