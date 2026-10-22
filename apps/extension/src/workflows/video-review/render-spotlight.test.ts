import { drawEdgePaddedBlur } from '../../features/video/composition/canvas/edge-padded-blur';
import { afterEach, expect, it, vi } from 'vitest';
import type { RenderResources } from '../../features/video/composition/canvas/render-resources';
import {
  createSceneSpotlightMasks,
  drawSceneSpotlights,
  drawSceneSpotlight,
} from '../../features/video/composition/draw/spotlight';

afterEach(() => vi.unstubAllGlobals());
it('copies the composed scene before blur and clips only the outside with even-odd fill', () => {
  vi.stubGlobal(
    'Path2D',
    class {
      constructor(public path: string) {}
    }
  );
  const events: string[] = [];
  const context = {
    save: () => events.push('save'),
    restore: () => events.push('restore'),
    clip: vi.fn(() => events.push('clip')),
    drawImage: () => events.push('blur'),
    fillRect: () => events.push('dim'),
    filter: 'none',
    fillStyle: '',
  };
  const copy = { clearRect: vi.fn(), drawImage: () => events.push('snapshot') };
  const scratch = { width: 100, height: 80, getContext: () => copy };
  drawSceneSpotlight(
    context as unknown as CanvasRenderingContext2D,
    { width: 100, height: 80 } as HTMLCanvasElement,
    scratch as unknown as HTMLCanvasElement,
    { opening: { x: 25, y: 20, width: 50, height: 40 }, radius: 4, dim: 0.3, blur: 6 }
  );
  expect(events).toEqual([
    'save',
    'clip',
    ...Array<string>(9).fill('snapshot'),
    'blur',
    'dim',
    'restore',
  ]);
  expect(scratch).toMatchObject({ width: 140, height: 120 });
  expect(context.clip.mock.calls[0]).toMatchObject([expect.anything(), 'evenodd']);
  expect(context.filter).toBe('none');
});

it.each([
  {
    name: 'overlapping openings protect their intersection instead of XOR',
    own: [255, 255],
    protection: [255, 255],
    presence: [1, 1],
    dim: [0.8, 0.5],
    blur: [12, 6],
    expected: [0, 0],
  },
  {
    name: 'nested opening protects the other mask',
    own: [0, 255],
    protection: [0, 255],
    presence: [1, 1],
    dim: [0.8, 0.5],
    blur: [12, 6],
    expected: [0, 0],
  },
  {
    name: 'zero presence does not protect another mask',
    own: [0, 255],
    protection: [0, 255],
    presence: [1, 0],
    dim: [0.8, 0],
    blur: [12, 0],
    expected: [204, 255],
  },
  {
    name: 'own fractional protection does not factor into its edge',
    own: [128, 0],
    protection: [128, 0],
    presence: [1, 1],
    dim: [0.8, 0.5],
    blur: [12, 6],
    expected: [102, 127],
  },
  {
    name: 'mixed strengths retain separate dim and normalized blur channels',
    own: [0, 0],
    protection: [0, 0],
    presence: [1, 1],
    dim: [0.2, 0.7],
    blur: [12, 3],
    expected: [179, 255],
  },
  {
    name: 'linked morph presence protects a third contracted mask',
    own: [255, 0, 0],
    protection: [255, 255, 0],
    presence: [1, 0.25, 1],
    dim: [0.8, 0.4, 0.9],
    blur: [0, 6, 12],
    expected: [0, 0],
  },
])('$name', async ({ own, protection, presence, dim, blur, expected }) => {
  vi.stubGlobal('Path2D', class {});
  const { createSceneSpotlightMasks } =
    await import('../../features/video/composition/draw/spotlight');
  const alphas = [...own, ...protection];
  const written: Uint8ClampedArray[] = [];
  vi.stubGlobal('document', {
    createElement: () => ({
      width: 1,
      height: 1,
      getContext: () => ({
        clearRect: vi.fn(),
        beginPath: vi.fn(),
        roundRect: vi.fn(),
        fill: vi.fn(),
        fillRect: vi.fn(),
        save: vi.fn(),
        translate: vi.fn(),
        restore: vi.fn(),
        clip: vi.fn(),
        getImageData: () => ({ data: new Uint8ClampedArray([0, 0, 0, alphas.shift()!]) }),
        createImageData: () => ({ data: new Uint8ClampedArray(4) }),
        putImageData: (data: ImageData) => written.push(data.data),
      }),
    }),
  });
  const masks = createSceneSpotlightMasks(
    { width: 1, height: 1 },
    own.map((_, i) => ({
      opening: { x: 0, y: 0, width: 1, height: 1 },
      radius: 0,
      protectionOpening: { x: 0, y: 0, width: 1, height: 1 },
      protectionRadius: 0,
      presence: presence[i]!,
      dim: dim[i]!,
      blur: blur[i]!,
    }))
  );
  expect(written.map((pixels) => pixels[3])).toEqual(expected);
  expect(masks.radius).toBe(Math.max(...blur));
  masks.dispose();
});

it('expands the animated clip without rasterizing unused single-mask protection', async () => {
  const { createSceneSpotlightMasks } =
    await import('../../features/video/composition/draw/spotlight');
  vi.stubGlobal('Path2D', class {});
  const rectangles = vi.fn();
  vi.stubGlobal('document', {
    createElement: () => ({
      width: 100,
      height: 100,
      getContext: () => ({
        clearRect: vi.fn(),
        save: vi.fn(),
        translate: vi.fn(),
        restore: vi.fn(),
        beginPath: vi.fn(),
        clip: vi.fn(),
        roundRect: rectangles,
        fill: vi.fn(),
        fillRect: vi.fn(),
        getImageData: () => ({ data: new Uint8ClampedArray(4) }),
        createImageData: () => ({ data: new Uint8ClampedArray(4) }),
        putImageData: vi.fn(),
      }),
    }),
  });
  const masks = createSceneSpotlightMasks(
    { width: 100, height: 100 },
    [
      {
        opening: { x: -70, y: -40, width: 180, height: 180 },
        radius: 50,
        dim: 0.8,
        blur: 0,
        protectionOpening: { x: -20, y: 10, width: 80, height: 80 },
        protectionRadius: 0,
        presence: 0,
        openingClipProgress: 0,
      },
    ].map((frame) => ({
      ...frame,
      clip: { rect: { x: 20, y: 20, width: 60, height: 60 }, radius: 4 },
    }))
  );
  expect(rectangles.mock.calls).toEqual([[-30, -30, 160, 160, 54]]);
  masks.dispose();
});

it('reuses the padded surface between video frames and refreshes its pixels', () => {
  const copy = { clearRect: vi.fn(), drawImage: vi.fn() };
  const scratch = { width: 140, height: 120, getContext: () => copy };
  const width = vi.fn(),
    height = vi.fn();
  Object.defineProperty(scratch, 'width', { get: () => 140, set: width });
  Object.defineProperty(scratch, 'height', { get: () => 120, set: height });
  const context = { filter: 'none', drawImage: vi.fn() };
  const source = { width: 100, height: 80 } as HTMLCanvasElement;
  for (let frame = 0; frame < 2; frame++)
    drawEdgePaddedBlur(
      context as unknown as CanvasRenderingContext2D,
      source,
      scratch as unknown as HTMLCanvasElement,
      6
    );
  expect(width).not.toHaveBeenCalled();
  expect(height).not.toHaveBeenCalled();
  expect(copy.clearRect).toHaveBeenCalledTimes(2);
  expect(context.drawImage).toHaveBeenCalledTimes(2);
  expect(context.filter).toBe('none');
});

it('fails the blur composition when its backing context is unavailable', () => {
  const scratch = { width: 140, height: 120, getContext: () => null };
  const context = { drawImage: vi.fn() };
  expect(() =>
    drawEdgePaddedBlur(
      context as unknown as CanvasRenderingContext2D,
      { width: 100, height: 80 } as HTMLCanvasElement,
      scratch as unknown as HTMLCanvasElement,
      6
    )
  ).toThrow('Spotlight compositor is unavailable.');
  expect(context.drawImage).not.toHaveBeenCalled();
});

function managedMasks(failRole?: string) {
  const fill = vi.fn();
  const released: string[] = [];
  const readbacks: { x: number; y: number; width: number; height: number }[] = [];
  const allocations: { role: string; width: number; height: number }[] = [];
  const writes: { role: string; x: number; y: number; pixels: number[] }[] = [];
  const resources: RenderResources = {
    bytes: vi.fn(() => ({ release: () => released.push('bytes') })),
    canvas(role, size) {
      if (role === failRole) throw new Error('admission failed');
      allocations.push({ role, ...size });
      let read = 0;
      const context = {
        save: vi.fn(),
        restore: vi.fn(),
        clearRect: vi.fn(),
        beginPath: vi.fn(),
        roundRect: vi.fn(),
        clip: vi.fn(),
        fill,
        drawImage: vi.fn(),
        getImageData: (x: number, y: number, width: number, height: number) => {
          readbacks.push({ x, y, width, height });
          const data = new Uint8ClampedArray(width * height * 4);
          const second = read++ % 2 === 1;
          for (let i = 0; i < width * height; i++)
            data[i * 4 + 3] = second
              ? x + (i % width) >= 6
                ? 255
                : 0
              : x + (i % width) < 4
                ? 255
                : 0;
          return { data };
        },
        createImageData: (width: number, height: number) => ({
          data: new Uint8ClampedArray(width * height * 4),
        }),
        putImageData: (image: ImageData, left: number, top: number) =>
          writes.push({
            role,
            x: left,
            y: top,
            pixels: [...image.data].filter((_, i) => i % 4 === 3),
          }),
      };
      const canvas = { ...size, getContext: () => context } as unknown as HTMLCanvasElement;
      return {
        canvas,
        context: context as unknown as CanvasRenderingContext2D,
        release: () => released.push(role),
      };
    },
  };
  return { resources, released, allocations, writes, readbacks, fill };
}
const maskFrames = [0.8, 0.5].map((dim) => ({
  opening: { x: 0, y: 0, width: 9, height: 3 },
  radius: 0,
  dim,
  blur: 6,
}));

it('uses global raster coverage with bounded tile readbacks and releases masks explicitly', () => {
  vi.stubGlobal('Path2D', class {});
  const owner = managedMasks();
  const masks = createSceneSpotlightMasks(
    { width: 9, height: 3 },
    maskFrames.map((frame) => ({ ...frame, clip: undefined, projection: undefined })),
    owner.resources
  );
  expect(owner.allocations).toContainEqual({ role: 'spotlight.hole', width: 9, height: 3 });
  expect(owner.readbacks).toHaveLength(36);
  expect(owner.readbacks.every((read) => read.width === 3 && read.height === 1)).toBe(true);
  expect(new Set(owner.readbacks.map((read) => `${read.x}:${read.y}`)).size).toBe(9);
  for (const write of owner.writes.filter((write) => write.role === 'spotlight.dim'))
    expect(write.pixels).toEqual(
      Array.from({ length: 3 }, (_, i) => (write.x + i >= 4 && write.x + i < 6 ? 204 : 0))
    );
  expect(owner.writes.filter((write) => write.role === 'spotlight.dim')).toHaveLength(9);
  // Tile data and prefix use 96 bytes. Group indices and references add 32 bytes.
  expect(owner.resources.bytes).toHaveBeenCalledWith('spotlight.coverage', 128);
  expect(owner.released).toEqual(['bytes', 'spotlight.hole']);
  masks.dispose();
  masks.dispose();
  expect(owner.released).toEqual(['bytes', 'spotlight.hole', 'spotlight.dim', 'spotlight.blur']);
});

it.each(['spotlight.blur', 'spotlight.hole'])(
  'releases admitted masks when %s acquisition fails',
  (role) => {
    const owner = managedMasks(role);
    expect(() =>
      createSceneSpotlightMasks(
        { width: 9, height: 3 },
        maskFrames.map((frame) => ({ ...frame, clip: undefined, projection: undefined })),
        owner.resources
      )
    ).toThrow('admission failed');
    expect(owner.released).toEqual(
      role === 'spotlight.blur' ? ['spotlight.dim'] : ['spotlight.dim', 'spotlight.blur']
    );
  }
);

it('disposes masks and layer when managed blur admission fails without publishing', () => {
  vi.stubGlobal('Path2D', class {});
  const owner = managedMasks('spotlight.paddedBlur');
  const context = { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D;
  expect(() =>
    drawSceneSpotlights(
      context,
      { width: 9, height: 3 } as HTMLCanvasElement,
      null,
      maskFrames.map((frame) => ({ ...frame, clip: undefined, projection: undefined })),
      owner.resources
    )
  ).toThrow('admission failed');
  expect(context.drawImage).not.toHaveBeenCalled();
  expect(owner.released).toEqual([
    'bytes',
    'spotlight.hole',
    'spotlight.layer',
    'spotlight.dim',
    'spotlight.blur',
  ]);
});

it('admits exact padded blur scratch and releases it after a failed draw', () => {
  const owner = managedMasks();
  const context = {
    filter: 'contrast(2)',
    drawImage: () => {
      throw new Error('draw failed');
    },
  };
  expect(() =>
    drawEdgePaddedBlur(
      context as unknown as CanvasRenderingContext2D,
      { width: 100, height: 80 } as HTMLCanvasElement,
      null,
      6,
      owner.resources
    )
  ).toThrow('draw failed');
  expect(owner.allocations).toEqual([{ role: 'spotlight.paddedBlur', width: 140, height: 120 }]);
  expect(owner.released).toEqual(['spotlight.paddedBlur']);
  expect(context.filter).toBe('contrast(2)');
});

it.each(['reservation', 'readback'])('releases all mask resources after %s failure', (failure) => {
  vi.stubGlobal('Path2D', class {});
  const owner = managedMasks();
  if (failure === 'reservation') {
    owner.resources.bytes = () => {
      throw new Error('reservation failed');
    };
  } else {
    const acquire = owner.resources.canvas.bind(owner.resources);
    owner.resources.canvas = (role, size, options) => {
      const lease = acquire(role, size, options);
      if (role === 'spotlight.hole')
        lease.context.getImageData = () => {
          throw new Error('readback failed');
        };
      return lease;
    };
  }
  expect(() =>
    createSceneSpotlightMasks(
      { width: 9, height: 3 },
      maskFrames.map((frame) => ({ ...frame, clip: undefined, projection: undefined })),
      owner.resources
    )
  ).toThrow(`${failure} failed`);
  expect(owner.released).toEqual([
    ...(failure === 'readback' ? ['bytes'] : []),
    'spotlight.hole',
    'spotlight.dim',
    'spotlight.blur',
  ]);
});

it('rasterizes a single opening once across all tiles and reserves only its three tile buffers', () => {
  vi.stubGlobal('Path2D', class {});
  const owner = managedMasks();
  const masks = createSceneSpotlightMasks(
    { width: 9, height: 3 },
    [maskFrames[0]!].map((frame) => ({ ...frame, clip: undefined, projection: undefined })),
    owner.resources
  );
  expect(owner.fill).toHaveBeenCalledOnce();
  expect(owner.readbacks).toHaveLength(6);
  expect(owner.resources.bytes).toHaveBeenCalledWith('spotlight.coverage', 60);
  expect(owner.allocations).toHaveLength(3);
  masks.dispose();
  expect(owner.released).toEqual(['bytes', 'spotlight.hole', 'spotlight.dim', 'spotlight.blur']);
});

it('uses each window attachment for its opening and protection without sharing another projection', () => {
  class RecordedPath {
    points: { x: number; y: number }[] = [];
    moveTo(x: number, y: number) {
      this.points.push({ x, y });
    }
    lineTo(x: number, y: number) {
      this.points.push({ x, y });
    }
    closePath() {}
  }
  vi.stubGlobal('Path2D', RecordedPath);
  const owner = managedMasks();
  const clips: RecordedPath[] = [];
  const acquire = owner.resources.canvas.bind(owner.resources);
  owner.resources.canvas = (role, size, options) => {
    const lease = acquire(role, size, options);
    if (role === 'spotlight.hole') {
      lease.context.clip = vi.fn((path?: Path2D | CanvasFillRule) => {
        if (path instanceof RecordedPath) clips.push(path);
      });
    }
    return lease;
  };
  const layers = [10, 30].map((x) => ({
    opening: { x: 0, y: 0, width: 9, height: 3 },
    radius: 0,
    dim: 0.5,
    blur: 0,
    clip: { rect: { x: 1, y: 0, width: 4, height: 3 }, radius: 0 },
    projection: [1, 0, x, 0, 1, 0, 0, 0, 1] as const,
  }));
  const masks = createSceneSpotlightMasks({ width: 1, height: 1 }, layers, owner.resources);
  expect(owner.fill.mock.calls.map(([path]) => path.points[0])).toEqual([
    { x: 19, y: 0 },
    { x: 39, y: 0 },
    { x: 19, y: 0 },
    { x: 39, y: 0 },
  ]);
  expect(clips.map((path) => path.points[0])).toEqual([
    { x: 15, y: 0 },
    { x: 35, y: 0 },
    { x: 15, y: 0 },
    { x: 35, y: 0 },
  ]);
  masks.dispose();
  expect(owner.released).toEqual(['bytes', 'spotlight.hole', 'spotlight.dim', 'spotlight.blur']);
});
