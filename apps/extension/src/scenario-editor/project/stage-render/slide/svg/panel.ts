import type { ScenarioRenderBox } from '../types';
import { escapeSvgAttribute } from './escape';
import { formatSvgMetric } from './metrics';
import { resolveSvgPaint } from './paint';

type SvgPanelRectOptions = {
  box: ScenarioRenderBox;
  fill: string;
  radius: string;
  stroke?: string;
  strokeWidth?: string;
};

export function renderPanelRectSvg({
  box,
  fill,
  radius,
  stroke,
  strokeWidth,
}: SvgPanelRectOptions): string {
  const safeFill = resolveSvgPaint(fill, '#ffffff');
  const safeStroke = stroke ? resolveSvgPaint(stroke, '#d8c7b3') : undefined;
  const strokeAttributes =
    safeStroke && strokeWidth
      ? ` stroke="${escapeSvgAttribute(safeStroke)}" stroke-width="${strokeWidth}"`
      : '';

  return [
    `<rect x="${formatSvgMetric(box.x)}" y="${formatSvgMetric(box.y)}"`,
    `width="${formatSvgMetric(box.width)}" height="${formatSvgMetric(box.height)}"`,
    `rx="${radius}"`,
    `fill="${escapeSvgAttribute(safeFill)}"${strokeAttributes}/>`,
  ].join(' ');
}
