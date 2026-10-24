// @vitest-environment jsdom

import { expect, it, vi } from 'vitest';
import { normalizeEditorFrameSettings } from '../../../features/editor/document/constants';
import { sampleGradient } from '@sniptale/foundation/paint';
import { createAdvancedBackgroundImage } from './raster';
import { parseImportedEditorDocument } from '../../document/file-actions/import-session';
import { prepareAppliedDocument } from '../document/prepare-applied';
import { createEditorDocumentFixture } from '../../document/page-session/document.test-support';

import {
  createBackgroundGradient,
  getBackgroundImageLayout,
  loadBackgroundImageElement,
  type BackgroundCanvasSize,
} from './geometry';

const SIZE: BackgroundCanvasSize = { width: 320, height: 180 };
const IMAGE = { height: 90, width: 100 };

it('keeps fabric gradient vectors aligned with css linear-gradient semantics', () => {
  const horizontal = createBackgroundGradient(SIZE, {
    backgroundGradientAngle: 90,
    backgroundGradientFrom: '#111111',
    backgroundGradientTo: '#222222',
  } as never);
  const vertical = createBackgroundGradient(SIZE, {
    backgroundGradientAngle: 0,
    backgroundGradientFrom: '#111111',
    backgroundGradientTo: '#222222',
  } as never);
  const threeStop = createBackgroundGradient(SIZE, {
    backgroundGradientAngle: 45,
    backgroundGradientColorStops: [
      { color: '#111111', offset: 0 },
      { color: '#555555', offset: 0.25, opacity: 0.5 },
      { color: '#222222', offset: 1 },
    ],
    backgroundGradientFrom: '#111111',
    backgroundGradientStops: ['#111111', '#555555', '#222222'],
    backgroundGradientTo: '#222222',
  } as never);

  expect(horizontal.coords.y1).toBe(horizontal.coords.y2);
  expect(horizontal.coords.x1).toBeLessThan(horizontal.coords.x2);
  expect(vertical.coords.x1).toBe(vertical.coords.x2);
  expect(vertical.coords.y1).toBeGreaterThan(vertical.coords.y2);
  expect(threeStop).toMatchObject({
    colorStops: [
      { color: '#111111', offset: 0 },
      { color: 'rgba(85, 85, 85, 0.5)', offset: 0.25 },
      { color: '#222222', offset: 1 },
    ],
  });
});

it('resolves image layouts for constrained background fits', () => {
  expect(getBackgroundImageLayout('contain', SIZE, IMAGE as never)).toMatchObject({
    left: 60,
    scaleX: 2,
    scaleY: 2,
    top: 0,
  });
  expect(getBackgroundImageLayout('fit-width', SIZE, IMAGE as never)).toMatchObject({
    scaleX: 3.2,
    scaleY: 3.2,
    top: -54,
  });
  expect(getBackgroundImageLayout('fit-height', SIZE, IMAGE as never)).toMatchObject({
    left: 60,
    scaleX: 2,
    scaleY: 2,
  });
  expect(getBackgroundImageLayout('cover', SIZE, IMAGE as never)).toMatchObject({
    scaleX: 3.2,
    scaleY: 3.2,
  });
});

it('rounds centered background image offsets to device pixels', () => {
  const layout = getBackgroundImageLayout('contain', { height: 181, width: 321 }, {
    height: 90,
    width: 100,
  } as never);

  expect(layout.left).toBe(60);
  expect(layout.top).toBe(0);
});

it('floors overflowing background image offsets to avoid top-left seams', () => {
  const layout = getBackgroundImageLayout('cover', { height: 181, width: 321 }, {
    height: 360,
    width: 640,
  } as never);

  expect(layout.left).toBe(-1);
  expect(layout.top).toBe(0);
});

it('surfaces image element load failures for tiled backgrounds', async () => {
  class BrokenImage {
    onerror: (() => void) | null = null;
    set src(_source: string) {
      this.onerror?.();
    }
  }
  vi.stubGlobal('Image', BrokenImage);

  await expect(loadBackgroundImageElement('data:image/png;base64,broken')).rejects.toThrow(
    'Failed to load editor background image'
  );
  vi.unstubAllGlobals();
});

it('renders canonical interpolation, midpoint, alpha and repeat in the bounded export pattern', async () => {
  const gradient = {
    type: 'linear' as const,
    angle: 90,
    interpolation: 'oklab' as const,
    repeat: { enabled: true, span: 0.5 },
    stops: [
      { id: 'a', color: '#ff000080', position: 0, midpoint: 0.2 },
      { id: 'b', color: '#0000ffff', position: 1, midpoint: 0.5 },
    ],
  };
  let painted: { data: Uint8ClampedArray } | undefined;
  const context = {
    createImageData: (width: number, height: number) => ({
      data: new Uint8ClampedArray(width * height * 4),
    }),
    putImageData: (image: { data: Uint8ClampedArray }) => {
      painted = image;
    },
  };
  const getContext = vi
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockImplementation(() => context as never);
  try {
    const frame = normalizeEditorFrameSettings({ backgroundGradient: gradient });
    const pattern = createAdvancedBackgroundImage({ width: 100, height: 1 }, frame);
    expect(pattern).toMatchObject({ scaleX: 1, scaleY: 1 });
    const data = painted!.data;
    for (const x of [0, 12, 24, 49, 50, 74, 99]) {
      const expected = sampleGradient(gradient, (((x + 0.5) / 100) % 0.5) / 0.5);
      const actual = Array.from(data.slice(x * 4, x * 4 + 4));
      const expectedBytes = [1, 3, 5, 7].map((start) =>
        Number.parseInt(expected.slice(start, start + 2), 16)
      );
      actual.forEach((channel, index) =>
        expect(Math.abs(channel - expectedBytes[index]!)).toBeLessThanOrEqual(2)
      );
    }
    createAdvancedBackgroundImage({ width: 10_000, height: 10_000 }, frame);
    expect(painted!.data.length).toBeLessThanOrEqual(4_194_304 * 4);
  } finally {
    getContext.mockRestore();
  }
});

it('keeps native vectors for simple canonical gradients and ignores stale legacy projections', async () => {
  const gradient = {
    type: 'linear' as const,
    angle: 90,
    interpolation: 'srgb' as const,
    repeat: { enabled: false, span: 1 },
    stops: [
      { id: 'a', color: '#ff000080', position: 0, midpoint: 0.5 },
      { id: 'b', color: '#0000ffff', position: 1, midpoint: 0.5 },
    ],
  };
  const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext');
  const frame = normalizeEditorFrameSettings({ backgroundGradient: gradient });
  expect(createAdvancedBackgroundImage(SIZE, frame)).toBeNull();
  const result = createBackgroundGradient(SIZE, frame);
  expect(result).toMatchObject({
    type: 'linear',
    colorStops: [
      { offset: 0, color: '#ff000080' },
      { offset: 1, color: '#0000ffff' },
    ],
  });
  expect(getContext).not.toHaveBeenCalled();
  getContext.mockRestore();
});

it('reports unavailable gradient context without changing the accepted frame', () => {
  const frame = normalizeEditorFrameSettings({
    backgroundGradient: {
      type: 'linear',
      angle: 0,
      interpolation: 'oklab',
      repeat: { enabled: false, span: 1 },
      stops: [
        { id: 'a', color: '#000000ff', position: 0, midpoint: 0.5 },
        { id: 'b', color: '#ffffffff', position: 1, midpoint: 0.5 },
      ],
    },
  });
  const original = structuredClone(frame);
  const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  try {
    expect(() => createAdvancedBackgroundImage(SIZE, frame)).toThrow(
      'Editor gradient raster context is unavailable'
    );
    expect(frame).toEqual(original);
  } finally {
    getContext.mockRestore();
  }
});

it.each([
  {
    label: 'omitted stop midpoints',
    stops: [
      { id: 'first', color: '#ff000080', position: 0 },
      { id: 'last', color: '#0000ffff', position: 1 },
    ],
    expectedMidpoints: [0.5, 0.5],
  },
  {
    label: 'unsorted stops with clamped positions and midpoints',
    stops: [
      { id: 'last', color: '#0000ffff', position: 2, midpoint: 8 },
      { id: 'first', color: '#ff000080', position: -1 },
    ],
    expectedMidpoints: [0.5, 0.99],
  },
])(
  'normalizes $label from a V2 session before preparing and rendering its frame',
  ({ stops, expectedMidpoints }) => {
    const document = createEditorDocumentFixture();
    const imported = parseImportedEditorDocument(
      JSON.stringify({
        ...document,
        frame: {
          ...document.frame,
          backgroundMode: 'gradient',
          backgroundGradient: {
            type: 'linear',
            angle: 450,
            interpolation: 'oklab',
            repeat: { enabled: false, span: 2 },
            stops,
          },
        },
      })
    );
    const prepared = prepareAppliedDocument(imported);
    let painted: Uint8ClampedArray | undefined;
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      createImageData: (width: number, height: number) => ({
        data: new Uint8ClampedArray(width * height * 4),
      }),
      putImageData: (image: { data: Uint8ClampedArray }) => {
        painted = image.data;
      },
    } as never);
    try {
      const image = createAdvancedBackgroundImage({ width: 100, height: 1 }, prepared.frame);
      expect(image).not.toBeNull();
      expect(prepared.frame.backgroundGradient).toMatchObject({
        angle: 90,
        repeat: { enabled: false, span: 1 },
        stops: [
          { id: 'first', position: 0, midpoint: expectedMidpoints[0] },
          { id: 'last', position: 1, midpoint: expectedMidpoints[1] },
        ],
      });
      const expectedColor = sampleGradient(prepared.frame.backgroundGradient!, 0.505);
      const expectedPixel = [1, 3, 5, 7].map((start) =>
        Number.parseInt(expectedColor.slice(start, start + 2), 16)
      );
      expect(Array.from(painted!.slice(50 * 4, 51 * 4))).toEqual(expectedPixel);
      expect(imported.frame.backgroundGradient?.angle).toBe(450);
    } finally {
      getContext.mockRestore();
    }
  }
);
