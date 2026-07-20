import { EXACT_BROWSER_FRAME_REFERENCE, EXACT_BROWSER_FRAME_TOKENS } from './assets';
import type { ExactBrowserFrameGeometry } from './geometry';

interface TemplateDefOptions {
  geometry: ExactBrowserFrameGeometry;
  headerHeight: number;
}

interface TemplateSlicesOptions {
  faviconDataUrl?: string | null;
  geometry: ExactBrowserFrameGeometry;
  headerHeight: number;
}

function createSlotClipPath(id: string, slot: ExactBrowserFrameGeometry['titleSlot']): string {
  return [
    `<clipPath id="${id}">`,
    `<rect x="${slot.left}" y="${slot.top}" width="${slot.width}" height="${slot.height}" rx="${slot.radius}" />`,
    '</clipPath>',
  ].join('');
}

function namespaceTemplateMarkup(markup: string, prefix: string): string {
  let namespacedMarkup = markup;
  const ids = Array.from(markup.matchAll(/\bid="([^"]+)"/g), (match) => match[1]);

  ids.forEach((id) => {
    namespacedMarkup = namespacedMarkup
      .replaceAll(`id="${id}"`, `id="${prefix}-${id}"`)
      .replaceAll(`url(#${id})`, `url(#${prefix}-${id})`);
  });

  return namespacedMarkup;
}

function createSlice(args: {
  destWidth: number;
  headerHeight: number;
  markup: string;
  prefix: string;
  sourceWidth: number;
  sourceX: number;
  x?: number;
}): string {
  const markup = namespaceTemplateMarkup(args.markup, args.prefix);

  return [
    `<svg x="${args.x ?? 0}" y="0" width="${args.destWidth}" height="${args.headerHeight}"`,
    `viewBox="${args.sourceX} 0 ${args.sourceWidth} ${EXACT_BROWSER_FRAME_REFERENCE.headerHeight}"`,
    'preserveAspectRatio="none">',
    markup,
    '</svg>',
  ].join(' ');
}

function resolveSliceMarkup(faviconDataUrl: string | null | undefined): string {
  return faviconDataUrl
    ? EXACT_BROWSER_FRAME_REFERENCE.shellMarkupWithoutFavicon
    : EXACT_BROWSER_FRAME_REFERENCE.shellMarkup;
}

export function createTemplateDefs({ geometry, headerHeight }: TemplateDefOptions): string {
  const scale = headerHeight / EXACT_BROWSER_FRAME_REFERENCE.headerHeight;

  return [
    '<defs>',
    '<filter id="shadow" x="-20%" y="-20%" width="140%" height="180%">',
    `<feDropShadow dx="0" dy="${8 * scale}" stdDeviation="${10 * scale}" `,
    `flood-color="${EXACT_BROWSER_FRAME_TOKENS.shadowColor}" flood-opacity="0.12" />`,
    '</filter>',
    createSlotClipPath('tab-favicon-clip', geometry.faviconSlot),
    createSlotClipPath('tab-title-clip', geometry.titleSlot),
    createSlotClipPath('url-clip', geometry.urlSlot),
    '</defs>',
  ].join('');
}

export function createTemplateSlices({
  faviconDataUrl,
  geometry,
  headerHeight,
}: TemplateSlicesOptions): string {
  const centerSourceWidth =
    EXACT_BROWSER_FRAME_REFERENCE.rightSliceX - EXACT_BROWSER_FRAME_REFERENCE.leftSliceWidth;
  const markup = resolveSliceMarkup(faviconDataUrl);

  return [
    createSlice({
      destWidth: geometry.header.leftWidth,
      headerHeight,
      markup,
      prefix: 'header-left',
      sourceWidth: EXACT_BROWSER_FRAME_REFERENCE.leftSliceWidth,
      sourceX: 0,
    }),
    createSlice({
      destWidth: geometry.header.width,
      headerHeight,
      markup,
      prefix: 'header-center',
      sourceWidth: centerSourceWidth,
      sourceX: EXACT_BROWSER_FRAME_REFERENCE.leftSliceWidth,
      x: geometry.header.centerLeft,
    }),
    createSlice({
      destWidth: geometry.header.rightWidth,
      headerHeight,
      markup,
      prefix: 'header-right',
      sourceWidth: EXACT_BROWSER_FRAME_REFERENCE.rightSliceWidth,
      sourceX: EXACT_BROWSER_FRAME_REFERENCE.rightSliceX,
      x: geometry.header.rightLeft,
    }),
  ].join('');
}
