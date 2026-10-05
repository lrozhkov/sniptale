// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { loadReviewWindowHeader, reviewWindowHeaderUrl } from './window-header';

afterEach(() => vi.unstubAllGlobals());

it('encodes title as inert XML text and includes no invented address', () => {
  const url = reviewWindowHeaderUrl({ kind: 'browser', title: '<img>&"' }, 1920);
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
  const url = reviewWindowHeaderUrl({ kind: 'browser', title: 'Example' }, 160);
  const controller = new AbortController();
  const success = loadReviewWindowHeader(url, controller.signal);
  const image = images.at(-1)!;
  image.dispatchEvent(new Event('load'));
  expect(await success).toBe(image);
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
    reviewWindowHeaderUrl({ kind: 'browser', title: 'a' + '😀'.repeat(40) }, 1920)
  ).not.toThrow();
});
