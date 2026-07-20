import type { ScenarioBaseRenderedElement } from '../types';
import type {
  ScenarioCalloutElement,
  ScenarioShapeElement,
} from '@sniptale/runtime-contracts/scenario/types/v3';
import { renderTextBlockSvg } from './text-block';
import { escapeSvgAttribute } from './escape';
import { formatSvgMetric, scaleSvgMetric } from './metrics';
import { renderPanelRectSvg } from './panel';
import { resolveSvgPaint } from './paint';

export function renderShapeElementSvg(
  rendered: ScenarioBaseRenderedElement<ScenarioShapeElement>
): string {
  const { box, element } = rendered;
  const scale = element.frame.width > 0 ? box.width / element.frame.width : 1;
  const strokeWidth = scaleSvgMetric(element.strokeWidth, scale);
  const fillColor = resolveSvgPaint(element.fillColor, 'transparent');
  const strokeColor = resolveSvgPaint(element.strokeColor, '#111111');
  if (element.shape === 'ellipse') {
    return [
      `<ellipse cx="${formatSvgMetric(box.centerX)}" cy="${formatSvgMetric(box.centerY)}"`,
      `rx="${formatSvgMetric(box.width / 2)}" ry="${formatSvgMetric(box.height / 2)}"`,
      `fill="${escapeSvgAttribute(fillColor)}"`,
      `stroke="${escapeSvgAttribute(strokeColor)}" stroke-width="${strokeWidth}"/>`,
    ].join(' ');
  }

  return [
    `<rect x="${formatSvgMetric(box.x)}" y="${formatSvgMetric(box.y)}"`,
    `width="${formatSvgMetric(box.width)}" height="${formatSvgMetric(box.height)}"`,
    `rx="${scaleSvgMetric(element.cornerRadius, scale)}"`,
    `fill="${escapeSvgAttribute(fillColor)}"`,
    `stroke="${escapeSvgAttribute(strokeColor)}" stroke-width="${strokeWidth}"/>`,
  ].join(' ');
}

export function renderCalloutElementSvg(
  rendered: ScenarioBaseRenderedElement<ScenarioCalloutElement>
): string {
  const { box, element } = rendered;
  const scale = element.frame.width > 0 ? box.width / element.frame.width : 1;
  const panelPadding = 24 * scale;
  const connectorColor = resolveSvgPaint(element.panel.borderColor, '#d8c7b3');
  const connector = element.connector
    ? [
        `<line x1="${formatSvgMetric(element.connector.start.x * scale)}"`,
        `y1="${formatSvgMetric(element.connector.start.y * scale)}"`,
        `x2="${formatSvgMetric(element.connector.end.x * scale)}"`,
        `y2="${formatSvgMetric(element.connector.end.y * scale)}"`,
        `stroke="${escapeSvgAttribute(connectorColor)}"`,
        `stroke-width="${scaleSvgMetric(3, scale)}"/>`,
      ].join(' ')
    : '';
  const panel = renderPanelRectSvg({
    box,
    fill: element.panel.backgroundColor,
    radius: scaleSvgMetric(18, scale),
    stroke: element.panel.borderColor,
    strokeWidth: scaleSvgMetric(element.panel.borderWidth, scale),
  });
  const text = renderTextBlockSvg({
    color: element.panel.textColor,
    fontFamily: 'Inter, Arial, sans-serif',
    fontSize: 22 * scale,
    fontWeight: 600,
    height: Math.max(0, box.height - panelPadding * 2),
    lineHeight: 28 * scale,
    text: element.text,
    width: Math.max(0, box.width - panelPadding * 2),
    x: box.x + panelPadding,
    y: box.y + panelPadding + 22 * scale,
  });

  return `${connector}${panel}${text}`;
}
