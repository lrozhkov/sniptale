// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { drawOpticalGlass, warpOpticalRim } from './optical-lens';

afterEach(() => vi.restoreAllMocks());

function monochrome(side: number) {
  const pixels = new Uint8ClampedArray(side * side * 4);
  for (let y = 0; y < side; y++)
    for (let x = 0; x < side; x++) {
      const i = (y * side + x) * 4;
      pixels[i] = pixels[i + 1] = pixels[i + 2] = x % 8 < 4 ? 255 : 0;
      pixels[i + 3] = 255;
    }
  return pixels;
}

it.each(['circle', 0, 0.18, 1] as const)(
  'keeps the sharp core uncovered and confines colored refraction to the rim (%s)',
  (corner) => {
    const side = 128;
    const source = monochrome(side);
    const rim = new Uint8ClampedArray(source.length);
    warpOpticalRim(source, rim, side, 2, corner);
    expect(rim[(64 * side + 64) * 4 + 3]).toBe(0);
    expect(rim[(64 * side + 90) * 4 + 3]).toBe(0);
    expect(rim[(64 * side + 126) * 4 + 3]).toBe(255);
    let color = 0;
    for (let i = 0; i < rim.length; i += 4) if (Math.abs(rim[i]! - rim[i + 2]!) > 12) color++;
    expect(color).toBeGreaterThan(100);
    expect(source).toEqual(monochrome(side));
  }
);

it('preserves transparent source pixels through the glass rim', () => {
  const source = new Uint8ClampedArray(64 * 64 * 4);
  const rim = new Uint8ClampedArray(source.length);
  warpOpticalRim(source, rim, 64, 3, 'circle');
  for (let i = 3; i < rim.length; i += 4) expect(rim[i]).toBe(0);
});

it.each(['readback', 'missing-context'] as const)(
  'retains sharp magnification and releases rasters after %s failure',
  (failure) => {
    const created: HTMLCanvasElement[] = [];
    const nativeCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      const canvas = nativeCreate(tag) as HTMLCanvasElement;
      created.push(canvas);
      return canvas;
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      failure === 'missing-context'
        ? null
        : ({
            scale: vi.fn(),
            getImageData: () => {
              throw new DOMException('Tainted', 'SecurityError');
            },
          } as unknown as CanvasRenderingContext2D)
    );
    const sharp = vi.fn();
    const context = { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D;
    drawOpticalGlass(context, { x: 0, y: 0, width: 800, height: 800 }, 2, 'circle', vi.fn(), sharp);
    expect(sharp).toHaveBeenCalledOnce();
    expect(context.drawImage).not.toHaveBeenCalled();
    for (const canvas of created) expect([canvas.width, canvas.height]).toEqual([0, 0]);
  }
);

it('releases both rasters and propagates a failed original source draw', () => {
  const created: HTMLCanvasElement[] = [];
  const nativeCreate = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tag) => {
    const canvas = nativeCreate(tag) as HTMLCanvasElement;
    created.push(canvas);
    return canvas;
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    scale: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  const sharp = vi.fn();
  expect(() =>
    drawOpticalGlass(
      {} as CanvasRenderingContext2D,
      { x: 0, y: 0, width: 440, height: 440 },
      2,
      'circle',
      () => {
        throw new Error('Source failed');
      },
      sharp
    )
  ).toThrow('Source failed');
  expect(sharp).not.toHaveBeenCalled();
  for (const canvas of created) expect([canvas.width, canvas.height]).toEqual([0, 0]);
});

it('widens only the authored shoulder while keeping the default narrow', () => {
  const side = 256,
    source = monochrome(side);
  const narrow = new Uint8ClampedArray(source.length),
    wide = new Uint8ClampedArray(source.length);
  warpOpticalRim(source, narrow, side, 2, 'circle');
  warpOpticalRim(source, wide, side, 2, 'circle', 25);
  const i = (128 * side + 240) * 4 + 3;
  expect(narrow[i]).toBe(0);
  expect(wide[i]).toBe(255);
});
