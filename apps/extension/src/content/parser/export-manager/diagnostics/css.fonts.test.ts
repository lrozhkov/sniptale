// @vitest-environment jsdom

import { afterEach, expect, it, vi } from 'vitest';
import { buildFontDiagnosticAsset } from './css.fonts';

afterEach(() => {
  vi.restoreAllMocks();
  document.head.replaceChildren();
  document.body.replaceChildren();
  Reflect.deleteProperty(document, 'fonts');
});

it('reports bounded font declarations, loaded state, and icon pseudo-element usage', () => {
  document.head.innerHTML = [
    '<style>',
    '@font-face { font-family: Icons; src: url("data:font/woff;base64,d09GRg==") format("woff"); }',
    '@font-face { font-family: Remote; src: url("https://cdn.test/icons.woff?token=secret"); }',
    '</style>',
  ].join('');
  document.body.innerHTML = '<button class="toolbar-icon"></button>';
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: {
      forEach(callback: (font: FontFace) => void) {
        callback({
          family: 'Icons',
          status: 'loaded',
          style: 'normal',
          weight: '400',
        } as FontFace);
      },
    },
  });
  vi.spyOn(window, 'getComputedStyle').mockImplementation((_element, pseudo) => {
    const style = document.createElement('span').style;
    style.setProperty('font-family', 'Icons');
    if (pseudo === '::before') style.setProperty('content', '"\\e001"');
    return style;
  });

  const asset = buildFontDiagnosticAsset();
  const payload = JSON.parse(String(asset.content)) as {
    declaredFaces: unknown[];
    loadedFonts: unknown[];
    usage: Array<{ pseudo: string | null }>;
  };

  expect(asset.path).toBe('logs/css/fonts.json');
  expect(payload.declaredFaces).toEqual([
    expect.objectContaining({
      family: 'Icons',
      sources: [{ kind: 'embedded', value: 'font/woff' }],
    }),
    expect.objectContaining({
      family: 'Remote',
      sources: [{ kind: 'url', value: 'https://cdn.test/icons.woff' }],
    }),
  ]);
  expect(payload.loadedFonts).toEqual([
    expect.objectContaining({ family: 'Icons', status: 'loaded' }),
  ]);
  expect(payload.usage.map(({ pseudo }) => pseudo)).toEqual([null, '::before']);
  expect(String(asset.content)).not.toContain('token=secret');
  expect(String(asset.content)).not.toContain('d09GRg==');
});

it('bounds and redacts page-authored font family evidence', () => {
  document.head.innerHTML = [
    '<style>',
    `@font-face { font-family: "token=private-${'x'.repeat(5_000)}"; src: url("data:font/woff,private-body"); }`,
    '</style>',
  ].join('');

  const content = String(buildFontDiagnosticAsset().content);

  expect(content).toContain('token=***');
  expect(content).toContain('font/woff');
  expect(content).not.toContain('private-body');
  expect(content.length).toBeLessThan(2_000);
});
