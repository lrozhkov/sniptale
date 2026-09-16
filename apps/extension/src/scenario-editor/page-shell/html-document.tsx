import { renderToStaticMarkup } from 'react-dom/server.browser';
import tokens from '@sniptale/ui/styles/design-tokens?raw';
import latin from '@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2?inline';
import cyrillic from '@fontsource-variable/manrope/files/manrope-cyrillic-wght-normal.woff2?inline';
import extended from '@fontsource-variable/manrope/files/manrope-latin-ext-wght-normal.woff2?inline';
import viewerScript from './html-viewer.js?raw';
import navigationCss from './reader-navigation.css?raw';
import { GuideReadingNavigation } from './reader-navigation';
import { DEFAULT_GUIDE_READING, type GuideReadingOptions } from './reader-pages';
import viewerCss from './html-viewer.css?raw';
import type { HtmlRaster } from './runtime/html-images';
import { resolveHtmlImageSettings } from './html-image-settings';
import documentCss from './document.css?raw';
import type {
  GuideProject,
  GuideImageBlock,
  GuideHtmlImageSettings,
} from '@sniptale/runtime-contracts/scenario/types/guide';
import type { Translate } from '../../platform/i18n';
import { GuideReadDocument } from './reader-document';

/** Static SVG references share raster bytes without requiring JavaScript to read the guide. */
export async function buildGuideHtml(
  project: GuideProject,
  t: Translate,
  theme: 'light' | 'dark',
  media: { rasters: HtmlRaster[]; blocks: ReadonlyMap<string, number> },
  reading: GuideReadingOptions = DEFAULT_GUIDE_READING
) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(viewerScript));
  const hash = btoa(String.fromCharCode(...new Uint8Array(digest)));
  const exportedProject = {
    ...project,
    items: project.items.map((item) => ({ ...item, id: `guide-item-${item.id}` })),
  };
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
    `script-src 'sha256-${hash}'`,
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
          <style>{tokens + fonts + base + documentCss + viewerCss + navigationCss}</style>
        </head>
        <body>
          <svg width="0" height="0" aria-hidden="true" style={{ position: 'absolute' }}>
            <defs>
              {media.rasters.map((raster, index) => (
                <image
                  key={index}
                  id={`guide-media-${index}`}
                  width={raster.width}
                  height={raster.height}
                  href={`data:${raster.mime};base64,SNIPTALE_ASSET_${index}`}
                />
              ))}
            </defs>
          </svg>
          <main className="guide-html-shell">
            <header className="guide-html-heading">
              <h1>{project.name}</h1>
              <div data-guide-pagination="" hidden>
                <button type="button" data-guide-previous="">
                  {t('scenario.editor.guideReaderPrevious')}
                </button>
                <output data-guide-progress="" aria-live="polite" />
                <button type="button" data-guide-next="">
                  {t('scenario.editor.guideReaderNext')}
                </button>
              </div>
            </header>
            <div
              className="guide-reading-layout"
              data-reading-mode={reading.mode}
              data-navigation={reading.navigation}
            >
              <GuideReadingNavigation project={exportedProject} t={t} />
              <div className="guide-html-content">
                <GuideReadDocument
                  project={exportedProject}
                  images={{}}
                  t={t}
                  renderImage={(block) => {
                    const index = media.blocks.get(block.id);
                    const raster = index === undefined ? undefined : media.rasters[index];
                    if (!raster || index === undefined) throw new Error('Missing export raster.');
                    return (
                      <HtmlImage
                        block={block}
                        raster={raster}
                        index={index}
                        settings={resolveHtmlImageSettings(project, block)}
                        t={t}
                      />
                    );
                  }}
                />
              </div>
            </div>
          </main>
          <dialog data-guide-viewer="" aria-label={t('scenario.editor.htmlImageOpen')}>
            <header>
              <button type="button" data-zoom="" aria-pressed="false">
                100%
              </button>
              <button type="button" data-close="">
                {t('common.actions.close')}
              </button>
            </header>
            <figure>
              <div data-viewport="">
                <img alt="" />
              </div>
              <figcaption />
            </figure>
          </dialog>
          <script>{viewerScript}</script>
        </body>
      </html>
    );
  return { html, rasters: media.rasters };
}

function HtmlImage({
  block,
  raster,
  index,
  settings,
  t,
}: {
  block: GuideImageBlock;
  raster: HtmlRaster;
  index: number;
  settings: GuideHtmlImageSettings;
  t: Translate;
}) {
  const transform =
    settings.content === 'frame' ? { x: 0, y: 0, scale: 1 } : block.contentTransform;
  return (
    <figure className="guide-read-image">
      <div
        className="guide-image-frame"
        style={{
          width: `min(100%, ${block.frame.width}px)`,
          aspectRatio: `${block.frame.width} / ${block.frame.height}`,
          ...{
            '--guide-frame-ratio': String(block.frame.width / block.frame.height),
          },
        }}
      >
        <svg
          role="img"
          aria-label={block.alt}
          viewBox={`0 0 ${raster.width} ${raster.height}`}
          preserveAspectRatio={
            settings.content === 'frame' || block.fit === 'contain'
              ? 'xMidYMid meet'
              : 'xMidYMid slice'
          }
          style={{
            width: '100%',
            height: '100%',
            overflow: 'hidden',
            translate: `${transform.x * 100}% ${transform.y * 100}%`,
            scale: transform.scale,
          }}
        >
          <use href={`#guide-media-${index}`} />
        </svg>
      </div>
      {settings.viewer && (
        <button
          hidden
          type="button"
          data-guide-open={`guide-media-${index}`}
          data-alt={block.alt}
          data-caption={block.caption}
          aria-label={t('scenario.editor.htmlImageOpen')}
        >
          +
        </button>
      )}
      {block.caption && <figcaption>{block.caption}</figcaption>}
    </figure>
  );
}
