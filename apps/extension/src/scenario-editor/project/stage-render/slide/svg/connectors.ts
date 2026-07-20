import type { ScenarioBaseRenderedElement } from '../types';
import type {
  ScenarioArrowElement,
  ScenarioLineElement,
} from '@sniptale/runtime-contracts/scenario/types/v3';
import { escapeSvgAttribute } from './escape';
import { formatSvgMetric, scaleSvgMetric } from './metrics';
import { resolveSvgPaint } from './paint';

function getDashArray(dash: ScenarioLineElement['dash'], scale: number): string {
  if (dash === 'dashed') {
    return `${scaleSvgMetric(10, scale)} ${scaleSvgMetric(8, scale)}`;
  }
  if (dash === 'dotted') {
    return `${scaleSvgMetric(2, scale)} ${scaleSvgMetric(8, scale)}`;
  }

  return '';
}

function renderConnectorLine(args: {
  dash: ScenarioLineElement['dash'];
  endX: number;
  endY: number;
  markerEnd?: string;
  startX: number;
  startY: number;
  strokeColor: string;
  strokeWidth: number;
  scale: number;
}): string {
  const dashArray = getDashArray(args.dash, args.scale);
  const marker = args.markerEnd ? ` marker-end="${escapeSvgAttribute(args.markerEnd)}"` : '';
  const dashAttribute = dashArray ? ` stroke-dasharray="${dashArray}"` : '';
  const strokeColor = resolveSvgPaint(args.strokeColor, '#111111');

  return [
    `<line x1="${formatSvgMetric(args.startX)}" y1="${formatSvgMetric(args.startY)}"`,
    `x2="${formatSvgMetric(args.endX)}" y2="${formatSvgMetric(args.endY)}"`,
    `stroke="${escapeSvgAttribute(strokeColor)}"`,
    `stroke-width="${scaleSvgMetric(args.strokeWidth, args.scale)}"`,
    `stroke-linecap="round"${dashAttribute}${marker}/>`,
  ].join(' ');
}

function getElementScale(
  rendered: ScenarioBaseRenderedElement<ScenarioArrowElement | ScenarioLineElement>
): number {
  return rendered.element.frame.width > 0 ? rendered.box.width / rendered.element.frame.width : 1;
}

export function renderLineElementSvg(
  rendered: ScenarioBaseRenderedElement<ScenarioLineElement>
): string {
  const { element } = rendered;
  const scale = getElementScale(rendered);
  return renderConnectorLine({
    dash: element.dash,
    endX: element.end.x * scale,
    endY: element.end.y * scale,
    scale,
    startX: element.start.x * scale,
    startY: element.start.y * scale,
    strokeColor: element.strokeColor,
    strokeWidth: element.strokeWidth,
  });
}

export function renderArrowElementSvg(
  rendered: ScenarioBaseRenderedElement<ScenarioArrowElement>
): string {
  const { element } = rendered;
  const scale = getElementScale(rendered);
  return renderConnectorLine({
    dash: element.dash,
    endX: element.end.x * scale,
    endY: element.end.y * scale,
    markerEnd: 'url(#scenario-arrow-head)',
    scale,
    startX: element.start.x * scale,
    startY: element.start.y * scale,
    strokeColor: element.strokeColor,
    strokeWidth: element.strokeWidth,
  });
}
