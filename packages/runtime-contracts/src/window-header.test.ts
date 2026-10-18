import { describe, expect, it } from 'vitest';
import { DEFAULT_WINDOW_HEADER, parseWindowHeader, windowHeaderGeometry } from './window-header';

describe('window header project contract', () => {
  it('admits each appearance and rejects remote favicon references', () => {
    for (const kind of ['browser', 'application'])
      for (const style of ['windows', 'macos', 'linux'])
        for (const theme of ['light', 'dark']) {
          const header = { ...DEFAULT_WINDOW_HEADER, kind, style, theme };
          expect(parseWindowHeader(header)).toEqual(header);
        }
    for (const faviconDataUrl of [
      'https://site.test/icon.png',
      'data:image/svg+xml,<svg/>',
      'data:image/png;base64,broken',
    ]) {
      expect(
        parseWindowHeader({ ...DEFAULT_WINDOW_HEADER, faviconEnabled: true, faviconDataUrl })
      ).toBeNull();
    }
  });
  it('scales proportionally across resolutions without stretching controls', () => {
    const small = windowHeaderGeometry(DEFAULT_WINDOW_HEADER, { width: 1920, height: 1080 });
    const large = windowHeaderGeometry(DEFAULT_WINDOW_HEADER, { width: 3840, height: 2160 });
    expect(large.height).toBe(small.height * 2);
    expect(large.layoutWidth).toBe(small.layoutWidth);
    expect(
      windowHeaderGeometry(DEFAULT_WINDOW_HEADER, { width: 360, height: 640 }).layoutWidth
    ).toBeGreaterThanOrEqual(480);
  });
  it('expands free space without resizing controls when only window width changes', () => {
    for (const height of [900, 1800]) {
      const layouts = [960, 1200, 1600, 2400].map((width) =>
        windowHeaderGeometry(DEFAULT_WINDOW_HEADER, { width, height })
      );
      expect(new Set(layouts.map((layout) => layout.scale)).size).toBe(1);
      expect(new Set(layouts.map((layout) => layout.height)).size).toBe(1);
      expect(layouts[1]!.layoutWidth - layouts[0]!.layoutWidth).toBe(240 / layouts[0]!.scale);
    }
  });
  it('rejects malformed text and a retained icon when disabled', () => {
    expect(parseWindowHeader({ ...DEFAULT_WINDOW_HEADER, title: 'x'.repeat(513) })).toBeNull();
    expect(parseWindowHeader({ ...DEFAULT_WINDOW_HEADER, title: '\uD800' })).toBeNull();
    expect(
      parseWindowHeader({
        ...DEFAULT_WINDOW_HEADER,
        faviconDataUrl: 'data:image/png;base64,iVBORw0KGgo=',
      })
    ).toBeNull();
  });
});

it('retains explicit file provenance, accepts legacy site headers, and rejects inconsistent sources', () => {
  const faviconDataUrl =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlH0H8AAAAASUVORK5CYII=';
  const saved = {
    ...DEFAULT_WINDOW_HEADER,
    faviconEnabled: true,
    faviconSource: 'file',
    faviconDataUrl,
  };
  expect(parseWindowHeader(saved)).toEqual(saved);
  expect(parseWindowHeader({ ...saved, faviconSource: undefined })?.faviconDataUrl).toBe(
    faviconDataUrl
  );
  for (const patch of [
    { faviconSource: 'invalid' },
    { faviconSource: null },
    { faviconEnabled: false },
    { faviconDataUrl: undefined },
  ])
    expect(parseWindowHeader({ ...saved, ...patch })).toBeNull();
});
