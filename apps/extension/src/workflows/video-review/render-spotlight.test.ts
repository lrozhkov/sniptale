import { afterEach, expect, it, vi } from 'vitest';
import { drawReviewSpotlight } from './render-spotlight';

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
  drawReviewSpotlight(
    context as unknown as CanvasRenderingContext2D,
    { width: 100, height: 80 } as HTMLCanvasElement,
    scratch as unknown as HTMLCanvasElement,
    { opening: { x: 25, y: 20, width: 50, height: 40 }, radius: 4, dim: 0.3, blur: 6 }
  );
  expect(events).toEqual(['snapshot', 'save', 'clip', 'blur', 'dim', 'restore']);
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
  const { createReviewSpotlightMasks } = await import('./render-spotlight');
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
        restore: vi.fn(),
        clip: vi.fn(),
        getImageData: () => ({ data: new Uint8ClampedArray([0, 0, 0, alphas.shift()!]) }),
        createImageData: () => ({ data: new Uint8ClampedArray(4) }),
        putImageData: (data: ImageData) => written.push(data.data),
      }),
    }),
  });
  const masks = createReviewSpotlightMasks(
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
});

it('expands only the animated contract clip while the protection hole retains the actual window', async () => {
  const { createReviewSpotlightMasks } = await import('./render-spotlight');
  vi.stubGlobal('Path2D', class {});
  const rectangles = vi.fn();
  vi.stubGlobal('document', {
    createElement: () => ({
      width: 100,
      height: 100,
      getContext: () => ({
        clearRect: vi.fn(),
        save: vi.fn(),
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
  createReviewSpotlightMasks(
    { width: 100, height: 100 },
    [
      {
        opening: { x: 0, y: 0, width: 100, height: 100 },
        radius: 0,
        dim: 0.8,
        blur: 0,
        protectionOpening: { x: -20, y: 10, width: 80, height: 80 },
        protectionRadius: 0,
        presence: 0,
        openingClipProgress: 0,
      },
    ],
    { rect: { x: 20, y: 20, width: 60, height: 60 }, radius: 4 }
  );
  expect(rectangles.mock.calls).toEqual([
    [0, 0, 100, 100, 0],
    [20, 20, 60, 60, 4],
  ]);
});
