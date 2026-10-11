// @vitest-environment jsdom
import { DEFAULT_WINDOW_HEADER } from '../../features/browser-frame/header';
import { afterEach, expect, it, vi } from 'vitest';
import {
  loadReviewWindowHeader,
  reviewWindowHeaderUrl,
  createReviewWindowRaster,
} from './window-header';

afterEach(() => vi.unstubAllGlobals());

it('encodes title as inert XML text and includes no invented address', () => {
  const url = reviewWindowHeaderUrl(
    { ...DEFAULT_WINDOW_HEADER, kind: 'browser' as const, title: '<img>&"' },
    1920,
    1080
  );
  const svg = decodeURIComponent(url.split(',')[1]!);
  expect(svg).toContain('&lt;img&gt;&amp;&quot;');
  expect(svg).not.toContain('<img>');
  expect(svg).not.toContain('example.com');
});

it('releases image listeners after load, failure and abort', async () => {
  const images: HTMLImageElement[] = [];
  vi.stubGlobal(
    'Image',
    class {
      constructor() {
        const image = document.createElement('img');
        images.push(image);
        return image;
      }
    }
  );
  const bitmap = { width: 784, height: 86, close: vi.fn() };
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => bitmap)
  );
  const url = reviewWindowHeaderUrl(
    { ...DEFAULT_WINDOW_HEADER, kind: 'browser' as const, title: 'Example' },
    160,
    90
  );
  const controller = new AbortController();
  const success = loadReviewWindowHeader(url, controller.signal);
  const image = images.at(-1)!;
  image.dispatchEvent(new Event('load'));
  expect(await success).toBe(bitmap);
  expect(image.getAttribute('src')).toBe('');
  expect(image.onload).toBeNull();
  const failure = loadReviewWindowHeader(url, controller.signal);
  const failed = expect(failure).rejects.toThrow('Window header is unavailable');
  images.at(-1)!.dispatchEvent(new Event('error'));
  await failed;
  const cancelled = loadReviewWindowHeader(url, controller.signal);
  const aborted = expect(cancelled).rejects.toMatchObject({ name: 'AbortError' });
  controller.abort();
  await aborted;
  expect(images.at(-1)!.onload).toBeNull();
  expect(images.at(-1)!.getAttribute('src')).toBe('');
});

it('renders a long Unicode tab title without splitting an emoji during truncation', () => {
  expect(() =>
    reviewWindowHeaderUrl(
      { ...DEFAULT_WINDOW_HEADER, kind: 'browser' as const, title: 'a' + '😀'.repeat(40) },
      1920,
      1080
    )
  ).not.toThrow();
});

it('renders supplied addresses as inert escaped text and keeps empty addresses blank', () => {
  const header = {
    ...DEFAULT_WINDOW_HEADER,
    kind: 'browser' as const,
    title: 'Tab',
    url: 'https://site.test/<img>?a="b"&c=1',
  };
  const svg = decodeURIComponent(reviewWindowHeaderUrl(header, 1920, 1080).split(',')[1]!);
  expect(svg).toContain('https://site.test/&lt;img&gt;?a=&quot;b&quot;&amp;c=1');
  expect(svg).not.toContain('<img>');
  expect(svg).not.toMatch(/(?:href|src)="https:\/\/site\.test/);
  expect(
    decodeURIComponent(reviewWindowHeaderUrl({ ...header, url: '  ' }, 1920, 1080))
  ).not.toContain('example.com');
});

it('closes a raster that finishes after cancellation and propagates rasterization failure', async () => {
  const image = document.createElement('img');
  vi.stubGlobal(
    'Image',
    class {
      constructor() {
        return image;
      }
    }
  );
  let resolve!: (value: ImageBitmap) => void;
  const rasterize = vi.fn(
    () =>
      new Promise<ImageBitmap>((done) => {
        resolve = done;
      })
  );
  vi.stubGlobal('createImageBitmap', rasterize);
  const controller = new AbortController();
  const pending = loadReviewWindowHeader('data:image/svg+xml,test', controller.signal);
  image.dispatchEvent(new Event('load'));
  await Promise.resolve();
  controller.abort();
  const bitmap = { width: 931, height: 86, close: vi.fn() };
  const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  resolve(bitmap);
  await rejected;
  expect(bitmap.close).toHaveBeenCalledOnce();
  expect(image.getAttribute('src')).toBe('');
  rasterize.mockRejectedValue(new Error('raster unavailable'));
  const failure = loadReviewWindowHeader('data:image/svg+xml,test', new AbortController().signal);
  image.dispatchEvent(new Event('load'));
  await expect(failure).rejects.toThrow('raster unavailable');
  expect(image.getAttribute('src')).toBe('');
});

it('reuses a joined window surface after drawing fails and releases each lease', () => {
  let allocations = 0;
  const context = {
    save: vi.fn(),
    restore: vi.fn(),
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    drawImage: vi.fn(),
  };
  vi.stubGlobal(
    'OffscreenCanvas',
    class {
      constructor(
        public width: number,
        public height: number
      ) {
        allocations++;
      }
      getContext() {
        return context;
      }
    }
  );
  const header = document.createElement('canvas');
  header.width = 931;
  header.height = 86;
  const args = {
    header,
    videoRect: { x: 0, y: 86, width: 931, height: 520 },
    windowRect: { x: 0, y: 0, width: 931, height: 606 },
    draw: vi.fn(),
  };
  args.draw.mockImplementationOnce(() => {
    throw new Error('frame failed');
  });
  expect(() => createReviewWindowRaster(args)).toThrow('frame failed');
  const raster = createReviewWindowRaster(args);
  expect(raster.width).toBe(931);
  expect(raster.height).toBe(606);
  expect(args.draw).toHaveBeenLastCalledWith(context, 0, 86, 931, 520);
  raster.release();
  expect(allocations).toBe(1);
  expect(context.restore).toHaveBeenCalledTimes(2);
});

it('extends even export rows without distorting small-source glyphs', () => {
  const svg = decodeURIComponent(
    reviewWindowHeaderUrl(DEFAULT_WINDOW_HEADER, 160, 90).split(',')[1]!
  );
  const root = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement;
  const [, , width, height] = root.getAttribute('viewBox')!.split(' ').map(Number);
  expect(Number(root.getAttribute('width')) / width!).toBeCloseTo(
    Number(root.getAttribute('height')) / height!
  );
  expect(root.getAttribute('height')).toBe('10');
  expect(root.getAttribute('preserveAspectRatio')).not.toBe('none');
});

it('matches a fitted DOM allocation without changing glyph scale or the encoder default', () => {
  const header = { ...DEFAULT_WINDOW_HEADER, title: 'Browser' };
  const displayHeight = (14 * 320) / 260;
  const svg = decodeURIComponent(
    reviewWindowHeaderUrl(header, 320, 180, displayHeight).split(',')[1]!
  );
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  expect(Number(doc.documentElement.getAttribute('height'))).toBe(displayHeight);
  const viewBox = doc.documentElement.getAttribute('viewBox')!.split(' ').map(Number);
  expect(320 / viewBox[2]!).toBeCloseTo(displayHeight / viewBox[3]!);
  expect(doc.querySelector('text')?.getAttribute('y')).toBe('24.75');
  const encoded = decodeURIComponent(reviewWindowHeaderUrl(header, 320, 180).split(',')[1]!);
  expect(
    new DOMParser().parseFromString(encoded, 'image/svg+xml').documentElement.getAttribute('height')
  ).toBe('18');
});

it('honors explicit backing despite intrinsic header width and shares one fractional video join', () => {
  const context = {
    save: vi.fn(),
    restore: vi.fn(),
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
  const release = vi.fn();
  const canvas = vi.fn((_role: string, size: { width: number; height: number }) => ({
    canvas: { ...size } as HTMLCanvasElement,
    context,
    release,
  }));
  const header = document.createElement('canvas');
  header.width = 1920;
  const draw = vi.fn();
  const args = {
    header,
    windowRect: { x: 10, y: 20, width: 1920, height: 1133 },
    videoRect: { x: 10, y: 73, width: 1920, height: 1080 },
    draw,
    backing: { width: 640, height: 378 },
    resources: { canvas, bytes: vi.fn() },
  };
  const raster = createReviewWindowRaster(args);
  expect(canvas).toHaveBeenCalledExactlyOnceWith('decorated-window', { width: 640, height: 378 });
  const join = (53 * 378) / 1133;
  expect(context.drawImage).toHaveBeenCalledWith(header, 0, 0, 640, expect.closeTo(join, 9));
  expect(draw).toHaveBeenCalledWith(
    context,
    0,
    expect.closeTo(join, 9),
    640,
    expect.closeTo((1080 * 378) / 1133, 9)
  );
  expect(context.globalCompositeOperation).toBe('lighter');
  expect(raster).toMatchObject({ width: 640, height: 378 });
  raster.release();
  expect(release).toHaveBeenCalledTimes(1);
  draw.mockImplementationOnce(() => {
    throw new Error('paint failed');
  });
  expect(() => createReviewWindowRaster(args)).toThrow('paint failed');
  expect(release).toHaveBeenCalledTimes(2);
});

it.each([0, -1, 1.5, NaN, Infinity])(
  'rejects invalid explicit window backing %s before acquisition',
  (width) => {
    const canvas = vi.fn();
    expect(() =>
      createReviewWindowRaster({
        header: document.createElement('canvas'),
        windowRect: { x: 0, y: 0, width: 1920, height: 1133 },
        videoRect: { x: 0, y: 53, width: 1920, height: 1080 },
        draw: vi.fn(),
        backing: { width, height: 378 },
        resources: { canvas, bytes: vi.fn() },
      })
    ).toThrow('Invalid window raster backing');
    expect(canvas).not.toHaveBeenCalled();
  }
);

it('retains fractional intrinsic raster geometry while managed allocation matches pool rounding', () => {
  const context = {
    save: vi.fn(),
    restore: vi.fn(),
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
  const release = vi.fn();
  const canvas = vi.fn((_role: string, size: { width: number; height: number }) => {
    expect(Number.isInteger(size.width)).toBe(true);
    expect(Number.isInteger(size.height)).toBe(true);
    return { canvas: { ...size } as HTMLCanvasElement, context, release };
  });
  const header = document.createElement('canvas');
  header.width = 1920;
  const draw = vi.fn();
  const scale = 1920 / 931;
  const raster = createReviewWindowRaster({
    header,
    windowRect: { x: 0, y: 0, width: 931, height: 606 },
    videoRect: { x: 0, y: 86, width: 931, height: 520 },
    draw,
    resources: { canvas, bytes: vi.fn() },
  });
  expect(canvas).toHaveBeenCalledExactlyOnceWith('decorated-window', {
    width: 1920,
    height: Math.ceil(606 * scale),
  });
  expect(raster.height).toBe(606 * scale);
  expect(draw).toHaveBeenCalledWith(context, 0, 86 * scale, expect.closeTo(1920, 8), 520 * scale);
  raster.release();
  expect(release).toHaveBeenCalledTimes(1);
});

it('decodes the canonical header into explicit backing without changing legacy decode options', async () => {
  const images: HTMLImageElement[] = [];
  vi.stubGlobal(
    'Image',
    class {
      constructor() {
        const image = document.createElement('img');
        images.push(image);
        return image;
      }
    }
  );
  const bitmap = { close: vi.fn() };
  const decode = vi.fn(async () => bitmap);
  vi.stubGlobal('createImageBitmap', decode);
  const signal = new AbortController().signal;
  const resized = loadReviewWindowHeader('data:image/svg+xml,test', signal, {
    backing: { width: 640, height: 48 },
  });
  images[0]!.dispatchEvent(new Event('load'));
  expect(await resized).toBe(bitmap);
  expect(decode).toHaveBeenLastCalledWith(images[0], {
    resizeWidth: 640,
    resizeHeight: 48,
    resizeQuality: 'high',
  });
  const legacy = loadReviewWindowHeader('data:image/svg+xml,test', signal);
  images[1]!.dispatchEvent(new Event('load'));
  await legacy;
  expect(decode).toHaveBeenLastCalledWith(images[1]);
});

it.each([0, -1, 1.5, NaN, Infinity])(
  'rejects invalid header backing %s before loading',
  async (width) => {
    const image = vi.fn();
    vi.stubGlobal('Image', image);
    await expect(
      loadReviewWindowHeader('data:image/svg+xml,test', new AbortController().signal, {
        backing: { width, height: 40 },
      })
    ).rejects.toThrow('Invalid window header backing');
    expect(image).not.toHaveBeenCalled();
  }
);
