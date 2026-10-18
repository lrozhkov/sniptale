import { createVideoProjectAsset } from '../../project/factories/creation';
import { createVideoClipFromAsset } from '../../project/factories/clip';
import { IDENTITY_TRANSITION_VISUAL_STATE } from '../../project/transition/presentation.types';
import { drawCompositionVisualLayer } from './visual';
import { createVisualTestContext } from './visual.test-support';
import { windowHeaderImageKey } from './window-header';
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

it('paints adjoining media and header edges in one raster before the transformed destination', () => {
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
  expect(paintedMedia[1]).toBe(4.7 + Number(paintedHeader[4]));
  expect(paintedMedia[4]).toBe(plane);
});

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
