import { escapeSvgAttribute, escapeSvgText } from './format';
import { buildSvgOpenTag } from './open-tag';

const FALLBACK_TEXT_COLOR = '#6b645b';

export function buildMissingAssetSvg(
  canvas: { height: number; width: number },
  backgroundColor: string,
  missingLabel?: string
) {
  return [
    buildSvgOpenTag(canvas),
    `<rect width="${canvas.width}" height="${canvas.height}" fill="${escapeSvgAttribute(
      backgroundColor
    )}" />`,
    [
      `<rect x="22" y="22" width="${canvas.width - 44}" height="${canvas.height - 44}"`,
      ' fill="none" stroke="#d7cebf" stroke-dasharray="8 8" rx="18" ry="18" />',
    ].join(''),
    [
      `<text x="${canvas.width / 2}" y="${canvas.height / 2}" text-anchor="middle"`,
      ` fill="${FALLBACK_TEXT_COLOR}" font-size="18" font-family="system-ui, sans-serif">`,
    ].join(''),
    escapeSvgText(missingLabel ?? 'Missing asset'),
    '</text></svg>',
  ].join('');
}
