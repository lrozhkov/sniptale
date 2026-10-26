import type { QuickActionAppearance } from '../../contracts/quick-action-appearance';
import { FULL_PAGE_QUALITY_ABSOLUTE_LIMITS as limits } from '../../contracts/full-page-capture';
import { windowHeaderGeometry, type WindowHeader } from '@sniptale/runtime-contracts/window-header';

export interface QuickActionAppearanceMetadata {
  title?: string;
  url?: string;
  date: string;
}

export function resolveQuickActionHeader(
  appearance: QuickActionAppearance,
  metadata: QuickActionAppearanceMetadata
): WindowHeader | null {
  if (!appearance.header) return null;
  const { faviconDataUrl: _icon, faviconSource: _source, ...header } = appearance.header;
  return {
    ...header,
    title:
      appearance.titleSource === 'page'
        ? (metadata.title ?? '').slice(0, 512).replace(/[\uD800-\uDFFF]/gu, '')
        : header.title,
    url:
      appearance.addressSource === 'page'
        ? (metadata.url ?? '').slice(0, 2048).replace(/[\uD800-\uDFFF]/gu, '')
        : header.url,
    ...(appearance.faviconMode === 'upload' && appearance.header.faviconDataUrl
      ? { faviconDataUrl: appearance.header.faviconDataUrl, faviconSource: 'file' as const }
      : {}),
  };
}

export function quickActionInformationLines(
  appearance: QuickActionAppearance,
  source: { width: number; height: number },
  metadata: QuickActionAppearanceMetadata
): string[] {
  const info = appearance.information;
  if (!info.enabled) return [];
  return [
    info.title ? metadata.title : '',
    info.url ? metadata.url : '',
    info.date ? metadata.date : '',
    info.dimensions ? `${source.width} × ${source.height}` : '',
    info.text,
  ]
    .filter((value): value is string => Boolean(value?.trim()))
    .map((value) => value.replace(/[\r\n\t]+/g, ' ').slice(0, 2048));
}

/** Bound the combined raster working set before allocating any decoration canvas. */
export function quickActionAppearanceGeometry(
  appearance: QuickActionAppearance,
  source: { width: number; height: number },
  lineCount: number
) {
  const padding =
    appearance.background.kind === 'none' ? 0 : Math.round(appearance.background.padding);
  const headerHeight = appearance.header
    ? Math.ceil(windowHeaderGeometry(appearance.header, source).height)
    : 0;
  const lineHeight = Math.ceil(appearance.information.size * 1.5);
  const informationHeight = lineCount ? lineHeight + 16 : 0;
  const width = source.width + padding * 2;
  const height = source.height + headerHeight + informationHeight + padding * 2;
  const pixelBytes = source.width * source.height * 4 + width * height * 8;
  if (
    ![source.width, source.height, width, height].every(
      (value) => Number.isSafeInteger(value) && value > 0 && value <= limits.maxRasterSidePx
    ) ||
    width * height > limits.maxMegapixels * 1_000_000 ||
    pixelBytes > limits.maxWorkingSetBytes ||
    !Number.isInteger(lineCount) ||
    lineCount < 0 ||
    lineCount > 5
  ) {
    throw new Error('Quick-action appearance exceeds raster limits');
  }
  const informationAbove = appearance.information.position === 'above' ? informationHeight : 0;
  const frameHeight = source.height + headerHeight + informationHeight;
  const frameRadius =
    appearance.background.kind === 'none'
      ? 0
      : Math.min(appearance.background.radius, source.width / 2, frameHeight / 2);
  const informationOffset =
    appearance.information.position === 'above'
      ? headerHeight + 8
      : headerHeight + source.height + 8;
  const edgeDistance = Math.min(informationOffset, frameHeight - informationOffset - lineHeight);
  const cornerInset =
    informationHeight && edgeDistance < frameRadius
      ? frameRadius - Math.sqrt(frameRadius ** 2 - (frameRadius - edgeDistance) ** 2)
      : 0;
  const informationInset = Math.max(Math.min(8, source.width / 4), Math.ceil(cornerInset));
  return {
    width,
    height,
    padding,
    headerHeight,
    informationHeight,
    lineHeight,
    frameHeight,
    frameRadius,
    informationInset,
    sourceX: padding,
    sourceY: padding + informationAbove + headerHeight,
    informationY:
      appearance.information.position === 'above'
        ? padding + headerHeight + 8
        : padding + headerHeight + source.height + 8,
  };
}
