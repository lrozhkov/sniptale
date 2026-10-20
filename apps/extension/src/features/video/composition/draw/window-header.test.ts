import {
  createProject,
  createVideoClip,
  createImageClip,
  createTextClip,
  createTrack,
} from '../../project/timeline/project-meta.test.helpers';
import { createVideoProjectAsset } from '../../project/factories/creation';
import { createVideoClipFromAsset } from '../../project/factories/clip';
import { IDENTITY_TRANSITION_VISUAL_STATE } from '../../project/transition/presentation.types';
import { drawCompositionVisualLayer } from './visual';
import { createVisualTestContext } from './visual.test-support';
import {
  admittedVisualWindowHeader,
  projectWindowHeaderImages,
  windowHeaderImageKey,
} from './window-header';
import { expect, it, vi } from 'vitest';
import {
  DEFAULT_WINDOW_HEADER,
  windowHeaderGeometry,
} from '@sniptale/runtime-contracts/window-header';
import {
  drawFittedMediaLayer,
  getFittedMediaContentFrame,
  mapSourceNormalizedPointToVisualLayer,
  mapVisualLayerPointToSourceNormalized,
} from './fitted-media';

it('moves source points below the header and inverses their rotated/scaled transform', () => {
  const mapping = {
    windowHeader: DEFAULT_WINDOW_HEADER,
    sourceWidth: 1920,
    sourceHeight: 1080,
    fitMode: 'CONTAIN' as const,
    frame: { x: 50, y: 25, width: 1920, height: 1300, rotation: 17 },
    renderState: { translateX: 40, translateY: -8, scaleX: 0.7, scaleY: 1.3 },
  };
  const content = getFittedMediaContentFrame(mapping);
  expect(content.y).toBeGreaterThan(mapping.frame.y);
  const point = { x: 0.2, y: 0.5 };
  const scene = mapSourceNormalizedPointToVisualLayer({ ...mapping, point });
  if (!scene) throw new Error('Expected scene point');
  const restored = mapVisualLayerPointToSourceNormalized({ ...mapping, point: scene });
  expect(restored?.x).toBeCloseTo(point.x);
  expect(restored?.y).toBeCloseTo(point.y);
});

it.each([false, true])(
  'paints header and crop=%s in one raster before the destination',
  (cropped) => {
    const plane = {
      reset: vi.fn(),
      setTransform: vi.fn(),
      clearRect: vi.fn(),
      drawImage: vi.fn(),
      save: vi.fn(),
      beginPath: vi.fn(),
      rect: vi.fn(),
      clip: vi.fn(),
      translate: vi.fn(),
      scale: vi.fn(),
      restore: vi.fn(),
    };
    const canvas = { width: 0, height: 0, getContext: () => plane };
    const ownerDocument = { createElement: () => canvas };
    const context = { canvas: { ownerDocument }, drawImage: vi.fn() };
    const header = {
      naturalHeight: windowHeaderGeometry(DEFAULT_WINDOW_HEADER, { width: 1920, height: 1080 })
        .height,
    };
    const render = vi.fn();
    drawFittedMediaLayer({
      context: context as unknown as CanvasRenderingContext2D,
      windowHeader: DEFAULT_WINDOW_HEADER,
      ...(cropped ? { sourceCrop: { x: 0.25, y: 0, width: 0.5, height: 1 } } : {}),
      windowHeaderImage: header as HTMLImageElement,
      displayScale: 0.53,
      fitMode: 'STRETCH',
      frame: { x: 12.2, y: 4.7, width: 1000.3, height: 600.4 },
      render,
      shadowIntensity: 0,
      shadowMode: undefined,
      sourceWidth: 1920,
      sourceHeight: 1080,
    });
    expect(context.drawImage).toHaveBeenCalledExactlyOnceWith(canvas, 12.2, 4.7, 1000.3, 600.4);
    const paintedHeader = plane.drawImage.mock.calls[0]!;
    const paintedMedia = render.mock.calls[0]!;
    expect(paintedHeader[4]).toBe(Math.round(Number(paintedHeader[4])));
    expect(paintedMedia[1]).toBeCloseTo(4.7 + (Number(paintedHeader[4]) * 600.4) / 601, 9);
    expect(plane.scale).toHaveBeenCalledWith(1001 / 1000.3, 601 / 600.4);
    expect(paintedMedia[4]).toBe(plane);
    if (cropped) {
      expect(paintedMedia[2]).toBeCloseTo(2000.6, 9);
      expect(paintedMedia[5]).toMatchObject({ x: 12.2, width: expect.closeTo(1000.3, 9) });
    }
  }
);

it('keeps source media visible while loading and reports decode failure with a restored canvas', () => {
  const asset = createVideoProjectAsset(
    'Image',
    'IMAGE',
    { kind: 'project-asset', projectAssetId: 'image' },
    {
      width: 1920,
      height: 1080,
      duration: null,
      mimeType: 'image/png',
      size: 100,
      hasAudio: false,
      audioPeaks: null,
    }
  );
  const clip = createVideoClipFromAsset('primary', asset, 1920, 1080);
  if (clip.type !== 'IMAGE') throw new Error('Expected image clip');
  const layer = {
    kind: 'image' as const,
    clip: { ...clip, windowHeader: DEFAULT_WINDOW_HEADER },
    clipId: clip.id,
    x: 0,
    y: 0,
    width: 1920,
    height: 1080,
    opacity: 1,
    rotation: 0,
    zIndex: 0,
    renderState: IDENTITY_TRANSITION_VISUAL_STATE,
  };
  const source = { naturalWidth: 1920, naturalHeight: 1080 } as HTMLImageElement;
  const context = createVisualTestContext();
  drawCompositionVisualLayer(context, layer, 1, 1, { [asset.id]: source }, new Map());
  expect(context.drawImage).toHaveBeenCalledWith(source, 0, 0, 1920, 1080);
  vi.mocked(context.restore).mockClear();
  const failedImage = { complete: true, naturalWidth: 0 } as HTMLImageElement;
  expect(() =>
    drawCompositionVisualLayer(
      context,
      layer,
      1,
      1,
      {
        [asset.id]: source,
        [windowHeaderImageKey(clip.id, DEFAULT_WINDOW_HEADER)]: failedImage,
      },
      new Map()
    )
  ).toThrow('Window header image could not be decoded');
  expect(context.restore).toHaveBeenCalledOnce();
});

it('rounds the complete cropped header plane while keeping source coordinates below its seam', () => {
  const plane = {
    reset: vi.fn(),
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    save: vi.fn(),
    beginPath: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    restore: vi.fn(),
  };
  const canvas = { width: 0, height: 0, getContext: () => plane };
  const context = {
    canvas: { ownerDocument: { createElement: () => canvas } },
    drawImage: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    roundRect: vi.fn(),
    clip: vi.fn(),
  };
  const geometry = {
    sourceWidth: 400,
    sourceHeight: 200,
    sourceCrop: { x: 0.25, y: 0, width: 0.5, height: 1 },
    frame: { x: 20, y: 40, width: 200, height: 200 },
    fitMode: 'STRETCH' as const,
    windowHeader: DEFAULT_WINDOW_HEADER,
  };
  const render = vi.fn();
  drawFittedMediaLayer({
    ...geometry,
    context: context as unknown as CanvasRenderingContext2D,
    windowHeaderImage: { naturalHeight: 40 } as HTMLImageElement,
    displayScale: 0.5,
    windowCornerRadius: 24,
    shadowIntensity: 0,
    shadowMode: undefined,
    render,
  });
  expect(context.roundRect).toHaveBeenCalledExactlyOnceWith(20, 40, 200, 200, 12);
  expect(context.clip).toHaveBeenCalledOnce();
  expect(context.restore).toHaveBeenCalledOnce();
  expect(render.mock.calls[0]![1]).toBeGreaterThan(40);
  expect(render.mock.calls[0]![4]).toBe(plane);
  const mapping = {
    ...geometry,
    windowCornerRadius: 50,
    frame: { ...geometry.frame, rotation: 0 },
    renderState: { translateX: 0, translateY: 0, scaleX: 1, scaleY: 1 },
  };
  expect(mapVisualLayerPointToSourceNormalized({ ...mapping, point: { x: 21, y: 41 } })).toBeNull();
  const source = { x: 0.5, y: 0.5 };
  const scene = mapSourceNormalizedPointToVisualLayer({ ...mapping, point: source });
  expect(scene).not.toBeNull();
  const restored = mapVisualLayerPointToSourceNormalized({ ...mapping, point: scene! });
  expect(restored?.x).toBeCloseTo(source.x, 9);
  expect(restored?.y).toBeCloseTo(source.y, 9);
});

it('admits the current header raster and refuses a stale raster after a title edit', () => {
  const clip = {
    id: 'concrete-video',
    windowHeader: { ...DEFAULT_WINDOW_HEADER, title: 'Original' },
  };
  const raster = { complete: true, naturalWidth: 640, naturalHeight: 36 } as HTMLImageElement;
  const bank = { [windowHeaderImageKey(clip.id, clip.windowHeader)]: raster };
  expect(admittedVisualWindowHeader(clip, bank, false)).toEqual({
    windowHeader: clip.windowHeader,
    windowHeaderImage: raster,
  });
  const edited = { ...clip, windowHeader: { ...clip.windowHeader, title: 'Edited' } };
  expect(admittedVisualWindowHeader(edited, bank, false)).toEqual({});
  expect(admittedVisualWindowHeader(clip, bank, false).windowHeaderImage).toBe(raster);
});

it('keeps absent and pending header resources non-destructive and excludes camera decoration', () => {
  const clip = { id: 'video', windowHeader: DEFAULT_WINDOW_HEADER };
  const raster = { complete: false, naturalWidth: 0, naturalHeight: 0 } as HTMLImageElement;
  const bank = { [windowHeaderImageKey(clip.id, clip.windowHeader)]: raster };
  expect(admittedVisualWindowHeader(clip, {}, false)).toEqual({});
  expect(admittedVisualWindowHeader({ id: clip.id }, bank, false)).toEqual({});
  expect(admittedVisualWindowHeader(clip, bank, false)).toEqual({
    windowHeader: clip.windowHeader,
    windowHeaderImage: raster,
  });
  expect(admittedVisualWindowHeader(clip, bank, true)).toEqual({});
  expect(clip.windowHeader).toBe(DEFAULT_WINDOW_HEADER);
});

it('reports a failed concrete header decode without accepting another window raster', () => {
  const clip = { id: 'failed-window', windowHeader: DEFAULT_WINDOW_HEADER };
  const failed = { complete: true, naturalWidth: 0, naturalHeight: 0 } as HTMLImageElement;
  const valid = { complete: true, naturalWidth: 640, naturalHeight: 36 } as HTMLImageElement;
  const bank = {
    [windowHeaderImageKey(clip.id, clip.windowHeader)]: failed,
    [windowHeaderImageKey('other-window', clip.windowHeader)]: valid,
  };
  const before = JSON.stringify(clip);
  expect(() => admittedVisualWindowHeader(clip, bank, false)).toThrow(
    'Window header image could not be decoded.'
  );
  expect(admittedVisualWindowHeader(clip, bank, true)).toEqual({});
  expect(JSON.stringify(clip)).toBe(before);
});

it('describes independent video and image header rasters without camera or unavailable materials', () => {
  const video = createVideoClip({
    id: 'decorated-video',
    windowHeader: { ...DEFAULT_WINDOW_HEADER, title: 'Video title' },
  });
  const image = createImageClip({
    id: 'decorated-image',
    assetId: 'still',
    windowHeader: { ...DEFAULT_WINDOW_HEADER, kind: 'application', title: 'Still title' },
  });
  const camera = { ...createTrack('camera-track', 2), role: 'CAMERA' as const };
  const cameraClip = createVideoClip({
    id: 'camera',
    trackId: camera.id,
    windowHeader: DEFAULT_WINDOW_HEADER,
  });
  const project = createProject([
    video,
    image,
    cameraClip,
    createVideoClip({ id: 'plain' }),
    createTextClip(),
    createVideoClip({ id: 'missing', assetId: 'missing', windowHeader: DEFAULT_WINDOW_HEADER }),
    createVideoClip({
      id: 'pending-width',
      assetId: 'pending-width',
      windowHeader: DEFAULT_WINDOW_HEADER,
    }),
    createVideoClip({
      id: 'pending-height',
      assetId: 'pending-height',
      windowHeader: DEFAULT_WINDOW_HEADER,
    }),
  ]);
  project.tracks.push(camera);
  project.assets.push(
    {
      ...project.assets[0]!,
      id: 'still',
      type: 'IMAGE',
      metadata: {
        ...project.assets[0]!.metadata,
        duration: null,
        hasAudio: false,
        mimeType: 'image/png',
      },
    },
    {
      ...project.assets[0]!,
      id: 'pending-width',
      metadata: { ...project.assets[0]!.metadata, width: 0 },
    },
    {
      ...project.assets[0]!,
      id: 'pending-height',
      metadata: { ...project.assets[0]!.metadata, height: 0 },
    }
  );
  const before = JSON.stringify(project);
  const rasters = projectWindowHeaderImages(project);
  expect(rasters.map((item) => item.key)).toEqual([
    windowHeaderImageKey(video.id, video.windowHeader!),
    windowHeaderImageKey(image.id, image.windowHeader!),
  ]);
  for (const raster of rasters) {
    expect(raster.src).toMatch(/^data:image\/svg\+xml;charset=utf-8,/);
    expect(decodeURIComponent(raster.src.slice(raster.src.indexOf(',') + 1))).toContain('<svg');
  }
  expect(projectWindowHeaderImages(project, [image])).toEqual([rasters[1]]);
  expect(JSON.stringify(project)).toBe(before);
});
