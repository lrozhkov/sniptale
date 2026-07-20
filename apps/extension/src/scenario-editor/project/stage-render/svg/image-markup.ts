import { escapeSvgAttribute, formatNumber } from './format';

export function buildScenarioImageMarkup(
  assetDataUrl: string,
  layout: {
    imageRect: { height: number; width: number; x: number; y: number };
  }
) {
  return [
    `<image href="${escapeSvgAttribute(assetDataUrl)}" x="${formatNumber(layout.imageRect.x)}"`,
    ` y="${formatNumber(layout.imageRect.y)}" width="${formatNumber(layout.imageRect.width)}"`,
    ` height="${formatNumber(layout.imageRect.height)}" preserveAspectRatio="none" />`,
  ].join('');
}
