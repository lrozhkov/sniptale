import { afterEach, expect, it, vi } from 'vitest';
import { getShowcaseGradient } from '../../../highlighter/showcase-resources';
import { drawSceneGradient } from './background-gradient-canvas';

function contextFixture() {
  const addColorStop = vi.fn();
  const gradient = () => ({ addColorStop });
  const calls = {
    save: vi.fn(),
    restore: vi.fn(),
    fillRect: vi.fn(),
    drawImage: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    createLinearGradient: vi.fn(gradient),
    createRadialGradient: vi.fn(gradient),
    createConicGradient: vi.fn(gradient),
  };
  return { calls, addColorStop, context: calls as unknown as CanvasRenderingContext2D };
}

afterEach(() => vi.unstubAllGlobals());

it.each(['system-ocean', 'system-radial-glow', 'system-conic-spectrum'] as const)(
  'draws %s and its repeated variant using canonical geometry',
  (id) => {
    for (const repeated of [false, true]) {
      const gradient = getShowcaseGradient(id);
      gradient.repeat = { enabled: repeated, span: 0.8 };
      const { context, calls, addColorStop } = contextFixture();
      drawSceneGradient(context, gradient, 200, 100);
      expect(calls.save).toHaveBeenCalledOnce();
      expect(calls.restore).toHaveBeenCalledOnce();
      expect(addColorStop.mock.calls.every(([offset]) => offset >= 0 && offset <= 1)).toBe(true);
      if (gradient.type === 'radial') {
        expect(calls.translate).toHaveBeenCalledWith(100, 50);
        expect(calls.scale).toHaveBeenCalledWith(144, 72);
        expect(calls.createRadialGradient).toHaveBeenCalledOnce();
      } else if (gradient.type === 'conic') {
        expect(calls.createConicGradient).toHaveBeenCalledWith(
          ((24 - 90) * Math.PI) / 180,
          100,
          50
        );
      } else expect(calls.createLinearGradient).toHaveBeenCalledOnce();
    }
  }
);

it('retains authored hard stops and handles a zero-width repeated gradient', () => {
  const gradient = getShowcaseGradient('system-ocean');
  gradient.interpolation = 'srgb';
  gradient.stops[1]!.position = 0;
  const { context, addColorStop } = contextFixture();
  drawSceneGradient(context, gradient, 100, 100);
  expect(addColorStop.mock.calls.slice(0, 2)).toEqual([
    [0, '#06b6d4ff'],
    [0, '#2563ebff'],
  ]);
  gradient.stops.forEach((stop) => {
    stop.position = 0.5;
  });
  gradient.repeat.enabled = true;
  addColorStop.mockClear();
  drawSceneGradient(context, gradient, 100, 100);
  expect(addColorStop).toHaveBeenCalledOnce();
  expect(addColorStop).toHaveBeenCalledWith(0, '#312e81ff');
});

it.each(['system-ocean', 'system-radial-glow', 'system-conic-spectrum'] as const)(
  'bounds dense %s repetition by output pixels',
  (id) => {
    const putImageData = vi.fn();
    class RasterSurface {
      constructor(
        public width: number,
        public height: number
      ) {}
      getContext() {
        return {
          createImageData: (width: number, height: number) => ({
            data: new Uint8ClampedArray(width * height * 4),
          }),
          putImageData,
        };
      }
    }
    vi.stubGlobal('OffscreenCanvas', RasterSurface);
    const gradient = getShowcaseGradient(id);
    gradient.repeat = { enabled: true, span: 0.01 };
    const { context, calls } = contextFixture();
    drawSceneGradient(context, gradient, 8, 4);
    expect(putImageData).toHaveBeenCalledOnce();
    expect(putImageData.mock.calls[0]![0].data).toHaveLength(128);
    expect(calls.drawImage).toHaveBeenCalledWith(expect.any(RasterSurface), 0, 0, 8, 4);
    expect(calls.createLinearGradient).not.toHaveBeenCalled();
  }
);

it('samples premultiplied colors when neighboring stop opacities differ', () => {
  const gradient = getShowcaseGradient('system-ocean');
  gradient.interpolation = 'srgb';
  gradient.stops[0]!.color = '#ff000000';
  gradient.stops[1]!.color = '#0000ff80';
  const { context, addColorStop } = contextFixture();
  drawSceneGradient(context, gradient, 100, 100);
  expect(addColorStop).toHaveBeenCalledWith(0.25, '#0000ff40');
});

it('uses integer raster rows for fractional preview bounds and scales back to the stage', () => {
  const allocate = vi.fn();
  const putImageData = vi.fn();
  class RasterSurface {
    constructor(width: number, height: number) {
      allocate(width, height);
    }
    getContext() {
      return {
        createImageData: (width: number, height: number) => ({
          data: new Uint8ClampedArray(width * height * 4),
        }),
        putImageData,
      };
    }
  }
  vi.stubGlobal('OffscreenCanvas', RasterSurface);
  const gradient = getShowcaseGradient('system-ocean');
  gradient.repeat = { enabled: true, span: 0.01 };
  const { context, calls } = contextFixture();
  drawSceneGradient(context, gradient, 8.5, 4.5);
  expect(allocate).toHaveBeenCalledWith(9, 5);
  const pixels: Uint8ClampedArray = putImageData.mock.calls[0]![0].data;
  expect(pixels).toHaveLength(180);
  expect(pixels.filter((_, index) => index % 4 === 3).every((alpha) => alpha === 255)).toBe(true);
  expect(calls.drawImage).toHaveBeenCalledWith(expect.any(RasterSurface), 0, 0, 8.5, 4.5);
});

function managedFixture() {
  const events: string[] = [];
  const releaseCanvas = vi.fn(() => events.push('release canvas'));
  const releasePixels = vi.fn(() => events.push('release pixels'));
  const releaseColors = vi.fn(() => events.push('release colors'));
  const createImageData = vi.fn((width: number, height: number) => {
    events.push('allocate pixels');
    return { data: new Uint8ClampedArray(width * height * 4) };
  });
  const putImageData = vi.fn();
  const canvas = {} as HTMLCanvasElement;
  const resources = {
    canvas: vi.fn(() => {
      events.push('reserve canvas');
      return {
        canvas,
        context: { createImageData, putImageData } as unknown as CanvasRenderingContext2D,
        release: releaseCanvas,
      };
    }),
    bytes: vi.fn((role: string) => {
      events.push(`reserve ${role}`);
      return { release: role === 'gradient-pixels' ? releasePixels : releaseColors };
    }),
  };
  return {
    resources,
    canvas,
    events,
    createImageData,
    putImageData,
    releaseCanvas,
    releasePixels,
    releaseColors,
  };
}

it.each(['system-ocean', 'system-radial-glow', 'system-conic-spectrum'] as const)(
  'samples canonical %s geometry into an anisotropic managed backing',
  (id) => {
    const gradient = getShowcaseGradient(id);
    gradient.repeat = { enabled: true, span: 0.01 };
    const reference = managedFixture();
    class RasterSurface {
      getContext() {
        return reference.resources.canvas().context;
      }
    }
    vi.stubGlobal('OffscreenCanvas', RasterSurface);
    drawSceneGradient(contextFixture().context, gradient, 9, 15);
    const expected = reference.putImageData.mock.calls[0]![0].data as Uint8ClampedArray;
    const managed = managedFixture();
    const { context, calls } = contextFixture();
    drawSceneGradient(context, gradient, 9, 15, {
      backing: { width: 3, height: 3 },
      resources: managed.resources,
    });
    const actual = managed.putImageData.mock.calls[0]![0].data as Uint8ClampedArray;
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 3; x++) {
        const offset = ((y * 5 + 2) * 9 + x * 3 + 1) * 4;
        expect(actual.slice((y * 3 + x) * 4, (y * 3 + x + 1) * 4)).toEqual(
          expected.slice(offset, offset + 4)
        );
      }
    }
    expect(managed.resources.canvas).toHaveBeenCalledWith('gradient-dense', {
      width: 3,
      height: 3,
    });
    expect(managed.resources.bytes.mock.calls).toEqual([
      ['gradient-pixels', 36],
      ['gradient-colors', 4097 * 4],
    ]);
    expect(managed.events).toEqual([
      'reserve canvas',
      'reserve gradient-pixels',
      'reserve gradient-colors',
      'allocate pixels',
      'release colors',
      'release pixels',
      'release canvas',
    ]);
    expect(calls.drawImage).toHaveBeenCalledWith(managed.canvas, 0, 0, 9, 15);
  }
);

it.each(['reservation', 'color reservation', 'image allocation', 'destination paint'] as const)(
  'propagates managed %s failure and releases acquired reservations',
  (failure) => {
    const gradient = getShowcaseGradient('system-ocean');
    gradient.repeat = { enabled: true, span: 0.01 };
    const managed = managedFixture();
    const { context, calls } = contextFixture();
    const error = new Error('resource failure');
    if (failure === 'reservation')
      managed.resources.bytes.mockImplementationOnce(() => {
        throw error;
      });
    if (failure === 'color reservation')
      managed.resources.bytes.mockImplementation((role) => {
        if (role === 'gradient-colors') throw error;
        return { release: managed.releasePixels };
      });
    if (failure === 'image allocation')
      managed.createImageData.mockImplementationOnce(() => {
        throw error;
      });
    if (failure === 'destination paint')
      calls.drawImage.mockImplementationOnce(() => {
        throw error;
      });
    expect(() =>
      drawSceneGradient(context, gradient, 100, 50, {
        backing: { width: 4, height: 2 },
        resources: managed.resources,
      })
    ).toThrow(error);
    expect(managed.releaseCanvas).toHaveBeenCalledOnce();
    if (failure === 'reservation') {
      expect(managed.createImageData).not.toHaveBeenCalled();
      expect(managed.releasePixels).not.toHaveBeenCalled();
      expect(managed.releaseColors).not.toHaveBeenCalled();
    } else if (failure === 'color reservation') {
      expect(managed.createImageData).not.toHaveBeenCalled();
      expect(managed.releasePixels).toHaveBeenCalledOnce();
      expect(managed.releaseColors).not.toHaveBeenCalled();
    } else {
      expect(managed.releasePixels).toHaveBeenCalledOnce();
      expect(managed.releaseColors).toHaveBeenCalledOnce();
    }
  }
);

it('leaves native gradients allocation-free and rejects invalid dense backing explicitly', () => {
  const gradient = getShowcaseGradient('system-ocean');
  const managed = managedFixture();
  const raster = { backing: { width: 0, height: 2 }, resources: managed.resources };
  const { context, calls } = contextFixture();
  drawSceneGradient(context, gradient, 100, 50, raster);
  expect(calls.createLinearGradient).toHaveBeenCalledOnce();
  expect(managed.resources.canvas).not.toHaveBeenCalled();
  gradient.repeat = { enabled: true, span: 0.01 };
  expect(() => drawSceneGradient(context, gradient, 100, 50, raster)).toThrow(
    'Invalid managed gradient raster'
  );
  expect(managed.resources.canvas).not.toHaveBeenCalled();
});
