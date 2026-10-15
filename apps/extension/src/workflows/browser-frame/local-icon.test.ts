// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { importWindowHeaderIcon } from './local-icon';
import { rasterizeWindowHeaderIcon } from './icon-raster';
vi.mock('./icon-raster', () => ({
  rasterizeWindowHeaderIcon: vi.fn(async () => 'normalized-png'),
}));
afterEach(() => vi.clearAllMocks());
const signal = () => new AbortController().signal;
function file(bytes: Uint8Array | string, name = 'icon.png', type = '') {
  const data = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes;
  return { name, type, size: data.length, arrayBuffer: async () => data.buffer } as File;
}
function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsText(blob);
  });
}
it.each([
  ['PNG', [137, 80, 78, 71, 13, 10, 26, 10], 'image/png'],
  ['ICO', [0, 0, 1, 0, 1, 0], 'image/x-icon'],
  ['JPEG', [255, 216, 255], 'image/jpeg'],
  ['WebP', [82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80], 'image/webp'],
])('detects %s by bytes and normalizes it', async (_label, signature, mime) => {
  expect(await importWindowHeaderIcon(file(new Uint8Array(signature as number[])), signal())).toBe(
    'normalized-png'
  );
  expect(vi.mocked(rasterizeWindowHeaderIcon).mock.calls[0]?.[0].type).toBe(mime);
});
it('rejects empty, oversized, spoofed and unsupported files before decode', async () => {
  for (const input of [
    file(''),
    file(new Uint8Array(2 * 1024 * 1024 + 1)),
    file('not PNG', 'icon.png', 'image/png'),
    file('GIF89a', 'icon.gif'),
  ])
    expect(await importWindowHeaderIcon(input, signal())).toBeNull();
  expect(rasterizeWindowHeaderIcon).not.toHaveBeenCalled();
});
it('makes SVG passive and resolves viewBox dimensions before rasterizing', async () => {
  await importWindowHeaderIcon(
    file(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50" onload="bad()"><script>bad()</script><image href="https://example.test/private"/><rect width="100" height="50" fill="red"/><animate attributeName="x"/></svg>',
      'icon.svg'
    ),
    signal()
  );
  const blob = vi.mocked(rasterizeWindowHeaderIcon).mock.calls[0]![0];
  const svg = await readBlob(blob);
  expect(blob.type).toBe('image/svg+xml');
  expect(svg).toContain('width="100"');
  expect(svg).toContain('height="50"');
  expect(svg).toContain('fill="red"');
  expect(svg).not.toMatch(/script|onload|https:|animate/);
});
it.each([
  '<svg',
  '<html/>',
  '<svg/>',
  '<svg width="5000" height="30"/>',
  `<svg width="20" height="20">${'<g/>'.repeat(2000)}</svg>`,
])('rejects invalid or excessive SVG', async (svg) => {
  await expect(importWindowHeaderIcon(file(svg, 'icon.svg'), signal())).rejects.toThrow();
  expect(rasterizeWindowHeaderIcon).not.toHaveBeenCalled();
});
it('does not decode a file after cancellation during reading', async () => {
  const controller = new AbortController();
  const input = file('data');
  input.arrayBuffer = async () => {
    controller.abort();
    return new ArrayBuffer(0);
  };
  await expect(importWindowHeaderIcon(input, controller.signal)).rejects.toMatchObject({
    name: 'AbortError',
  });
  expect(rasterizeWindowHeaderIcon).not.toHaveBeenCalled();
});
