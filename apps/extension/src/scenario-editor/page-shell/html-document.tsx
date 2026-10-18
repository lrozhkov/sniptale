import { Search, X } from 'lucide-react';
import { renderToStaticMarkup } from 'react-dom/server.browser';
import tokens from '@sniptale/ui/styles/design-tokens?raw';
import interfaceFont from '@sniptale/ui/styles/interface-font?inline';
import interfaceLicense from '@sniptale/ui/styles/interface-font-license?raw';
import documentFont from '@sniptale/ui/styles/document-font?inline';
import documentLicense from '@sniptale/ui/styles/document-font-license?raw';
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

/** Fixed executable digest admits saved HTML without trusting hashes supplied by an archive. */
export async function getGuideHtmlRuntimeHash(): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(viewerScript));
  return btoa(String.fromCharCode(...new Uint8Array(digest)));
}

/** Static SVG references share raster bytes without requiring JavaScript to read the guide. */
export async function buildGuideHtml(
  project: GuideProject,
  t: Translate,
  theme: 'light' | 'dark',
  media: { rasters: HtmlRaster[]; blocks: ReadonlyMap<string, number> },
  reading: GuideReadingOptions = DEFAULT_GUIDE_READING
) {
  const hash = await getGuideHtmlRuntimeHash();
  const exportedProject = {
    ...project,
    items: project.items.map((item) => ({ ...item, id: `guide-item-${item.id}` })),
  };
  const fonts =
    `@font-face{font-family:"Sniptale Interface";font-style:normal;font-weight:400 700;` +
    `src:url("${interfaceFont}") format("woff2");}` +
    `@font-face{font-family:"Sniptale Text";font-style:normal;font-weight:400 900;` +
    `src:url("${documentFont}") format("woff2");}`;
  const base =
    '*{box-sizing:border-box}' +
    'body{margin:0;padding:24px;font-family:var(--sniptale-font-document-sans);' +
    'background:var(--sniptale-color-surface-canvas);' +
    'color:var(--sniptale-color-text-primary)}' +
    'main>h1{max-width:1200px;margin:0 auto 24px;overflow-wrap:anywhere}' +
    '[data-guide-pagination],[data-guide-viewer] header,' +
    '.guide-reading-nav{font-family:var(--sniptale-font-interface)}';
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
          <pre hidden data-guide-interface-font-license="">
            {interfaceLicense}
          </pre>
          <pre hidden data-guide-document-font-license="">
            {documentLicense}
          </pre>
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
          <HtmlImageViewer t={t} />
          <script>{viewerScript}</script>
        </body>
      </html>
    );
  return { html, rasters: media.rasters };
}

function HtmlImageViewer({ t }: { t: Translate }) {
  return (
    <dialog data-guide-viewer="" data-zoom="fit" aria-label={t('scenario.editor.htmlImageOpen')}>
      <header>
        <button
          type="button"
          data-fit=""
          aria-pressed="true"
          aria-label={t('scenario.editor.htmlFit')}
          title={t('scenario.editor.htmlFit')}
        >
          {t('scenario.editor.htmlFit')}
        </button>
        <button type="button" data-zoom="" aria-pressed="false" aria-label="100%" title="100%">
          100%
        </button>
        <button
          type="button"
          data-close=""
          aria-label={t('common.actions.close')}
          title={t('common.actions.close')}
        >
          <X size={18} aria-hidden="true" />
        </button>
      </header>
      <figure>
        <div
          data-viewport=""
          tabIndex={0}
          role="region"
          aria-label={t('scenario.editor.htmlPreview')}
        >
          <img alt="" />
        </div>
        <figcaption />
      </figure>
    </dialog>
  );
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
          data-caption-alignment={block.captionAlignment ?? 'center'}
          aria-label={t('scenario.editor.htmlImageOpen')}
          title={t('scenario.editor.htmlImageOpen')}
        >
          <Search size={18} aria-hidden="true" />
        </button>
      )}
      {block.caption && (
        <figcaption style={{ textAlign: block.captionAlignment ?? 'center' }}>
          {block.caption}
        </figcaption>
      )}
    </figure>
  );
}
