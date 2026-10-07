import { DEFAULT_WINDOW_HEADER } from '../../features/browser-frame/header';
// @vitest-environment jsdom
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
