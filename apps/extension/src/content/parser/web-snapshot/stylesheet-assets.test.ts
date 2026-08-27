// @vitest-environment jsdom

import { expect, it } from 'vitest';
import { prepareStylesheetAsset } from './stylesheet-assets';

function readBlobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.readAsText(blob);
  });
}

it('normalizes external stylesheets rule by rule and exposes nested resources', async () => {
  const asset = {
    blob: new Blob(
      [
        ':root { --hero: url("./hero.png"); --color: red; }',
        '.hero { background: var(--hero); color: var(--color); }',
        '.unsafe { width: expression(alert(1)); }',
        '@import "./theme.css" screen;',
        '@font-face { font-family: Demo; src: url("./demo.woff2"); }',
      ],
      { type: 'text/css' }
    ),
    localPath: 'assets/styles.css',
    originalUrl: 'https://cdn.example.com/css/styles.css',
  };

  const prepared = await prepareStylesheetAsset(asset);
  expect(prepared.targets.map((target) => target.url)).toEqual([
    'https://cdn.example.com/css/hero.png',
    'https://cdn.example.com/css/theme.css',
    'https://cdn.example.com/css/demo.woff2',
  ]);
  prepared.finish();
  const css = await readBlobText(asset.blob);
  expect(css).toContain('var(--hero)');
  expect(css).toContain('@import url("https://cdn.example.com/css/theme.css") screen;');
  expect(css).not.toContain('expression');
});
