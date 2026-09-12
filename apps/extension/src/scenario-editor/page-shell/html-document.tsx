import { renderToStaticMarkup } from 'react-dom/server.browser';
import tokens from '@sniptale/ui/styles/design-tokens?raw';
import latin from '@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2?inline';
import cyrillic from '@fontsource-variable/manrope/files/manrope-cyrillic-wght-normal.woff2?inline';
import extended from '@fontsource-variable/manrope/files/manrope-latin-ext-wght-normal.woff2?inline';
import documentCss from './document.css?raw';
import type { GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
import type { Translate } from '../../platform/i18n';
import { GuideReadDocument } from './reader-document';

/** Private data-URI markers are replaced only inside serialized image source attributes. */
export function buildGuideHtml(project: GuideProject, t: Translate, theme: 'light' | 'dark') {
  const assets = [
    ...new Set(
      project.items.flatMap((item) =>
        item.kind === 'step'
          ? item.blocks.flatMap((block) => (block.kind === 'image' ? [block.assetId] : []))
          : []
      )
    ),
  ];
  const images = Object.fromEntries(
    assets.map((id, index) => [id, `data:image/png;base64,SNIPTALE_ASSET_${index}`])
  );
  const fonts = [latin, cyrillic, extended]
    .map(
      (url, index) =>
        `@font-face{font-family:Guide${index};font-style:normal;font-weight:200 800;src:url("${url}") format("woff2");}`
    )
    .join('');
  const base =
    ':root{--sniptale-font-sans:Guide0,Guide1,Guide2,sans-serif}*{box-sizing:border-box}' +
    'body{margin:0;padding:24px;font-family:var(--sniptale-font-sans);' +
    'background:var(--sniptale-color-surface-canvas);' +
    'color:var(--sniptale-color-text-primary)}' +
    'main>h1{max-width:1200px;margin:0 auto 24px;overflow-wrap:anywhere}';
  const policy = [
    "default-src 'none'",
    'img-src data:',
    'font-src data:',
    "style-src 'unsafe-inline'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
  const html =
    '<!doctype html>' +
    renderToStaticMarkup(
      <html data-theme={theme}>
        <head>
          <meta charSet="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <meta httpEquiv="Content-Security-Policy" content={policy} />
          <title>{project.name}</title>
          <style>{tokens + fonts + base + documentCss}</style>
        </head>
        <body>
          <main>
            <h1>{project.name}</h1>
            <GuideReadDocument project={project} images={images} t={t} />
          </main>
        </body>
      </html>
    );
  return { html, assets };
}
