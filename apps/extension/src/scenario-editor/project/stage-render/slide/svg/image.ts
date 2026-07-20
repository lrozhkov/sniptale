import type { ScenarioRenderedImageElement } from '../types';
import { escapeSvgAttribute, escapeSvgText } from './escape';
import { formatSvgMetric, scaleSvgMetric } from './metrics';

export function renderImageElementSvg(rendered: ScenarioRenderedImageElement): string {
  const { asset, box, contentBox, element } = rendered;
  const clipId = `scenario-clip-${escapeSvgAttribute(element.id)}`;
  const scale = element.frame.width > 0 ? box.width / element.frame.width : 1;
  const cornerRadius = scaleSvgMetric(12, scale);
  const frame = [
    `<rect x="${formatSvgMetric(box.x)}" y="${formatSvgMetric(box.y)}"`,
    `width="${formatSvgMetric(box.width)}" height="${formatSvgMetric(box.height)}"`,
    `rx="${cornerRadius}" fill="#efe6d8" stroke="#d8c7b3"`,
    `stroke-width="${scaleSvgMetric(1, scale)}"/>`,
  ].join(' ');

  if (!asset) {
    const missingAssetLabel = rendered.missingAssetLabel ?? 'Missing image';
    if (!missingAssetLabel) {
      return frame;
    }

    const labelX = box.centerX;
    const labelY = box.centerY;
    return [
      frame,
      `<text x="${formatSvgMetric(labelX)}" y="${formatSvgMetric(labelY)}"`,
      'text-anchor="middle" fill="#7c6f62"',
      'font-family="Inter, Arial, sans-serif"',
      `font-size="${scaleSvgMetric(22, scale)}">`,
      escapeSvgText(missingAssetLabel),
      '</text>',
    ].join(' ');
  }

  const image = [
    `<image href="${escapeSvgAttribute(asset.source)}" x="${formatSvgMetric(contentBox.x)}"`,
    `y="${formatSvgMetric(contentBox.y)}" width="${formatSvgMetric(contentBox.width)}"`,
    `height="${formatSvgMetric(contentBox.height)}" preserveAspectRatio="none"/>`,
  ].join(' ');
  const clipPath = [
    `<clipPath id="${clipId}"><rect x="${formatSvgMetric(box.x)}"`,
    `y="${formatSvgMetric(box.y)}" width="${formatSvgMetric(box.width)}"`,
    `height="${formatSvgMetric(box.height)}" rx="${cornerRadius}"/></clipPath>`,
  ].join(' ');

  return `${clipPath}${frame}<g clip-path="url(#${clipId})">${image}</g>`;
}
