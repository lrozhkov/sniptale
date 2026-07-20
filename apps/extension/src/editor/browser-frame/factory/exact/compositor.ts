import { EXACT_BROWSER_FRAME_REFERENCE, EXACT_BROWSER_FRAME_TOKENS } from './assets';
import { resolveExactBrowserFrameGeometry, type ExactBrowserFrameGeometry } from './geometry';
import { createTemplateDefs, createTemplateSlices } from './template-svg';
import { resolveExactBrowserFrameTitleText, resolveExactBrowserFrameUrlText } from './text';

interface ExactBrowserFrameCompositorOptions {
  contentHeight: number;
  faviconDataUrl?: string | null;
  headerHeight: number;
  height: number;
  radius: number;
  title: string;
  url: string;
  width: number;
}

function escapeXmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function createBodyShell(
  options: ExactBrowserFrameCompositorOptions,
  geometry: ExactBrowserFrameGeometry
): string {
  if (options.contentHeight <= 0) {
    return '';
  }

  return [
    `<rect y="${geometry.bodyTop}" width="${options.width}"`,
    `height="${options.contentHeight + 1}" fill="${EXACT_BROWSER_FRAME_TOKENS.bodyFill}"`,
    `rx="${options.radius}" ry="${options.radius}" />`,
    `<rect y="${geometry.bodyTop}" width="${options.width}"`,
    `height="${options.contentHeight + 1}" fill="none"`,
    `stroke="${EXACT_BROWSER_FRAME_TOKENS.contentBorder}"`,
    `rx="${options.radius}" ry="${options.radius}" />`,
  ].join(' ');
}

function createContentOutline(options: ExactBrowserFrameCompositorOptions): string {
  if (options.contentHeight <= 0) {
    return '';
  }

  return [
    `<rect y="${options.headerHeight}" width="${options.width}"`,
    `height="${options.contentHeight}" fill="transparent"`,
    `stroke="${EXACT_BROWSER_FRAME_TOKENS.contentStroke}" />`,
  ].join(' ');
}

function createFaviconLayer(
  geometry: ExactBrowserFrameGeometry,
  faviconDataUrl: string | null | undefined
): string {
  if (!faviconDataUrl) {
    return '';
  }

  return [
    '<g clip-path="url(#tab-favicon-clip)">',
    `<image href="${escapeXmlAttribute(faviconDataUrl)}"`,
    `x="${geometry.faviconSlot.left}" y="${geometry.faviconSlot.top}"`,
    `width="${geometry.faviconSlot.width}" height="${geometry.faviconSlot.height}"`,
    'preserveAspectRatio="xMidYMid slice" />',
    '</g>',
  ].join(' ');
}

function replaceAttribute(markup: string, name: string, value: string): string {
  const attributeToken = `${name}="`;
  const attributeStart = markup.indexOf(attributeToken);

  if (attributeStart >= 0) {
    const valueStart = attributeStart + attributeToken.length;
    const valueEnd = markup.indexOf('"', valueStart);
    if (valueEnd >= 0) {
      return `${markup.slice(0, valueStart)}${value}${markup.slice(valueEnd)}`;
    }
  }

  return markup.replace(/^<([a-z]+)/, `<$1 ${name}="${value}"`);
}

function buildTemplateTextNode(args: {
  baseline: number;
  headerHeight: number;
  markup: string;
  text: string;
  x: number;
}): string {
  const scale = args.headerHeight / EXACT_BROWSER_FRAME_REFERENCE.headerHeight;
  const templateMarkup =
    args.markup.trim() ||
    '<text font-family="Segoe UI" font-size="12"><tspan x="0" y="0"></tspan></text>';
  const resizedMarkup = replaceAttribute(
    templateMarkup,
    'font-size',
    String(12 * scale).replace(/\.0$/, '')
  );

  return resizedMarkup.replace(
    /<tspan\b[^>]*>[\s\S]*?<\/tspan>/,
    `<tspan x="${args.x}" y="${args.baseline}">${args.text}</tspan>`
  );
}

function createTextLayers(
  options: ExactBrowserFrameCompositorOptions,
  geometry: ExactBrowserFrameGeometry,
  titleText: string,
  urlText: string
): string {
  return [
    '<g clip-path="url(#tab-title-clip)">',
    buildTemplateTextNode({
      baseline: geometry.titleSlot.textBaseline,
      headerHeight: options.headerHeight,
      markup: EXACT_BROWSER_FRAME_REFERENCE.tabTitleMarkup,
      text: titleText,
      x: geometry.titleSlot.textLeft,
    }),
    '</g>',
    '<g clip-path="url(#url-clip)">',
    buildTemplateTextNode({
      baseline: geometry.urlSlot.textBaseline,
      headerHeight: options.headerHeight,
      markup: EXACT_BROWSER_FRAME_REFERENCE.urlMarkup,
      text: urlText,
      x: geometry.urlSlot.textLeft,
    }),
    '</g>',
  ].join(' ');
}

export function composeExactBrowserFrameSvg(options: ExactBrowserFrameCompositorOptions): string {
  const geometry = resolveExactBrowserFrameGeometry(options);
  const titleText = resolveExactBrowserFrameTitleText(geometry.titleSlot.width, options.title);
  const urlText = resolveExactBrowserFrameUrlText(geometry.urlSlot.width, options.url);
  const shell = [
    createBodyShell(options, geometry),
    createTemplateSlices({
      faviconDataUrl: options.faviconDataUrl ?? null,
      geometry,
      headerHeight: options.headerHeight,
    }),
    createFaviconLayer(geometry, options.faviconDataUrl),
    createTextLayers(options, geometry, titleText, urlText),
    createContentOutline(options),
  ].join('');
  const chromeShell =
    options.contentHeight > 0 ? `<g filter="url(#shadow)">${shell}</g>` : `<g>${shell}</g>`;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" `,
    `xmlns:xlink="http://www.w3.org/1999/xlink" `,
    `width="${options.width}" height="${options.height}" `,
    `viewBox="0 0 ${options.width} ${options.height}" fill="none">`,
    createTemplateDefs({ geometry, headerHeight: options.headerHeight }),
    chromeShell,
    '</svg>',
  ].join('');
}
