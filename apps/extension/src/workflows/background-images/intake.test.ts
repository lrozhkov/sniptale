// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { prepareBackgroundSvg, prepareBackgroundImage } from './intake';
afterEach(() => vi.unstubAllGlobals());
it('retains passive SVG gradients while removing scripts, foreign content and external resources', () => {
  const result = prepareBackgroundSvg(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" onload="evil()"><script>evil()</script><foreignObject/><image href="https://example.com/a.png"/>' +
      '<defs><linearGradient id="g"><stop stop-color="red"/></linearGradient></defs>' +
      '<rect width="640" height="360" fill="url(#g)"/></svg>'
  );
  expect(result).toContain('width="640"');
  expect(
    new DOMParser()
      .parseFromString(result, 'image/svg+xml')
      .querySelector('rect')
      ?.getAttribute('fill')
  ).toBe('url("#g")');
  expect(result).not.toMatch(/evil|foreignObject|https:\/\/example/);
});
it('rejects malformed or oversized vector dimensions before decoding', () => {
  for (const text of [
    '<html/>',
    '<svg/>',
    '<svg width="9999999" height="200"/>',
    '<svg viewBox="0 0 -2 50"/>',
  ])
    expect(() => prepareBackgroundSvg(text)).toThrow();
});
it('rejects nonimage files and byte-budget violations before decoding', async () => {
  await expect(
    prepareBackgroundImage(new File(['text'], 'x.txt', { type: 'text/plain' }))
  ).rejects.toThrow();
  const large = new File(['x'], 'x.png', { type: 'image/png' });
  Object.defineProperty(large, 'size', { value: 17 * 1024 * 1024 });
  await expect(prepareBackgroundImage(large)).rejects.toThrow();
});
