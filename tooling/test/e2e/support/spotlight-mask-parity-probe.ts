import {
  createSceneSpotlightMasks,
  type SceneSpotlightClip,
} from '../../../../apps/extension/src/features/video/composition/draw/spotlight';
import type { SceneSpotlightFrame } from '../../../../apps/extension/src/features/video/composition/scene-spotlight';
import type { QuickEditHomography } from '../../../../apps/extension/src/features/video/composition/motion/spatial-geometry';
import type { RenderResources } from '../../../../apps/extension/src/features/video/composition/canvas/render-resources';
import { createUntiledSpotlightMasks } from './spotlight-mask-reference';

type Size = { width: number; height: number };
type Fixture = {
  name: string;
  output: Size;
  frames: SceneSpotlightFrame[];
  clip?: SceneSpotlightClip;
  projection?: QuickEditHomography;
};

function fixture(
  name: string,
  width: number,
  height: number,
  clipped = false,
  projected = false
): Fixture {
  const rect = (x: number, y: number, w: number, h: number) => ({
    x: x * width,
    y: y * height,
    width: w * width,
    height: h * height,
  });
  return {
    name,
    output: { width, height },
    frames: [
      {
        opening: rect(-0.071, 0.123, 0.612, 0.647),
        radius: height * 0.137,
        protectionOpening: rect(0.111, 0.231, 0.301, 0.329),
        protectionRadius: height * 0.041,
        presence: 0.37,
        openingClipProgress: 0.42,
        dim: 0.73,
        blur: 7.25,
      },
      {
        opening: rect(0.317, 0.271, 0.536, 0.591),
        radius: height * 0.093,
        presence: 1,
        dim: 0.31,
        blur: 13.5,
      },
      {
        opening: rect(0.713, -0.057, 0.357, 0.492),
        radius: height * 0.061,
        presence: 0,
        dim: 0.19,
        blur: 2.75,
      },
    ],
    ...(clipped
      ? { clip: { rect: rect(0.053, 0.079, 0.884, 0.853), radius: height * 0.113 } }
      : {}),
    ...(projected
      ? {
          projection: [
            0.91,
            0.13,
            0.037 * width,
            -0.07,
            1.03,
            0.029 * height,
            0.13 / width,
            -0.08 / height,
            1,
          ] as const,
        }
      : {}),
  };
}

function resourceOwner() {
  let canvases = 0,
    bytes = 0,
    highBytes = 0;
  let hole: Size | null = null;
  let tile: Size | null = null;
  const resources: RenderResources = {
    canvas(role, size, options) {
      const canvas = Object.assign(document.createElement('canvas'), size);
      const context = canvas.getContext('2d', options);
      if (!context) throw new Error('Probe canvas unavailable');
      canvases++;
      if (role === 'spotlight.hole') {
        hole = { ...size };
        const read = context.getImageData.bind(context);
        context.getImageData = (x, y, width, height, settings) => {
          tile ??= { width, height };
          return read(x, y, width, height, settings);
        };
      }
      let released = false;
      return {
        canvas,
        context,
        release() {
          if (released) return;
          released = true;
          canvases--;
          canvas.width = canvas.height = 0;
        },
      };
    },
    bytes(_role, count) {
      bytes += count;
      highBytes = Math.max(highBytes, bytes);
      let released = false;
      return {
        release() {
          if (released) return;
          released = true;
          bytes -= count;
        },
      };
    },
  };
  return { resources, state: () => ({ canvases, bytes, highBytes, hole, tile }) };
}

function compare(actual: HTMLCanvasElement, expected: HTMLCanvasElement, tile: Size) {
  const width = actual.width,
    height = actual.height;
  const a = actual.getContext('2d')!.getImageData(0, 0, width, height).data;
  const e = expected.getContext('2d')!.getImageData(0, 0, width, height).data;
  let maxDifference = 0,
    differentPixels = 0,
    seamDifferentPixels = 0,
    fractionalPixels = 0;
  let first: { x: number; y: number; actual: number[]; expected: number[] } | null = null;
  for (let i = 0; i < a.length; i += 4) {
    const x = (i / 4) % width,
      y = Math.floor(i / 4 / width);
    let differs = false;
    if (e[i + 3]! > 0 && e[i + 3]! < 255) fractionalPixels++;
    for (let channel = 0; channel < 4; channel++) {
      const difference = Math.abs(a[i + channel]! - e[i + channel]!);
      maxDifference = Math.max(maxDifference, difference);
      differs ||= difference !== 0;
    }
    if (differs) {
      differentPixels++;
      if (
        (tile.width < width && (x % tile.width === 0 || x % tile.width === tile.width - 1)) ||
        (tile.height < height && (y % tile.height === 0 || y % tile.height === tile.height - 1))
      )
        seamDifferentPixels++;
      first ??= { x, y, actual: [...a.slice(i, i + 4)], expected: [...e.slice(i, i + 4)] };
    }
  }
  return { maxDifference, differentPixels, seamDifferentPixels, fractionalPixels, first };
}

function appendComparison(name: string, actual: HTMLCanvasElement, expected: HTMLCanvasElement) {
  const row = document.createElement('div');
  const label = document.createElement('span');
  label.textContent = name;
  label.style.cssText = 'display:inline-block;width:210px;font:12px monospace';
  row.append(label);
  for (const source of [expected, actual]) {
    const thumbnail = document.createElement('canvas');
    thumbnail.width = 160;
    thumbnail.height = 90;
    thumbnail.style.cssText =
      'margin:2px;background:white;border:1px solid #aaa;vertical-align:middle';
    thumbnail.getContext('2d')!.drawImage(source, 0, 0, 160, 90);
    row.append(thumbnail);
  }
  document.body.append(row);
}

/** Exact same-browser comparison to the frozen pre-tiling mask algorithm. */
export function probe() {
  const cases = [
    fixture('tiny-1x1', 1, 1, true),
    fixture('tiny-3x2', 3, 2, true, true),
    fixture('odd-fractional', 37, 23),
    fixture('clipped-fractional', 321, 181, true),
    fixture('projected-fractional', 321, 181, true, true),
    fixture('full-1080p', 1920, 1080, true, true),
  ];
  cases.push({
    name: 'full-protection',
    output: { width: 17, height: 11 },
    frames: [
      { opening: { x: -2, y: -2, width: 21, height: 15 }, radius: 0, dim: 1, blur: 9 },
      { opening: { x: 2.25, y: 3.5, width: 1.25, height: 2.5 }, radius: 0.3, dim: 0.5, blur: 3 },
    ],
  });
  for (const [name, clipped, projected, blur] of [
    ['single-fractional', false, false, 7.25],
    ['single-clipped', true, false, 7.25],
    ['single-projected', true, true, 7.25],
    ['single-projected-no-blur', true, true, 0],
  ] as const) {
    const single = fixture(name, 321, 181, clipped, projected);
    single.frames = [{ ...single.frames[0]!, blur }];
    cases.push(single);
  }
  document.body.style.cssText = 'background:#eee;margin:8px';
  const heading = document.createElement('p');
  heading.textContent = 'Untiled reference (left) / tiled candidate (right)';
  document.body.append(heading);
  return cases.flatMap((entry) =>
    [false, true].map((managed) => {
      const owner = resourceOwner();
      const expected = createUntiledSpotlightMasks(
        entry.output,
        entry.frames,
        entry.clip,
        entry.projection
      );
      let actual: ReturnType<typeof createSceneSpotlightMasks> | undefined;
      try {
        actual = createSceneSpotlightMasks(
          entry.output,
          entry.frames.map((frame) => ({
            ...frame,
            clip: entry.clip,
            projection: entry.projection,
          })),
          managed ? owner.resources : undefined
        );
        const pixels = Math.max(
          1,
          Math.floor((entry.output.width * entry.output.height) / (2 * entry.frames.length + 3))
        );
        const width = Math.min(entry.output.width, pixels);
        const tile = owner.state().tile ?? {
          width,
          height: Math.max(1, Math.min(entry.output.height, Math.floor(pixels / width))),
        };
        const dim = compare(actual.dim, expected.dim, tile),
          blur = compare(actual.blur, expected.blur, tile);
        if (managed) appendComparison(entry.name, actual.dim, expected.dim);
        actual.dispose();
        return {
          name: entry.name,
          managed,
          output: entry.output,
          tile,
          radius: actual.radius,
          expectedRadius: expected.radius,
          dim,
          blur,
          resources: owner.state(),
        };
      } finally {
        actual?.dispose();
        expected.dispose();
      }
    })
  );
}
