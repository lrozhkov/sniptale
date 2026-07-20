import type { ScenarioBaseRenderedElement } from '../types';
import type {
  ScenarioCodeElement,
  ScenarioTextElement,
} from '@sniptale/runtime-contracts/scenario/types/v3';
import { renderTextBlockSvg } from './text-block';
import { scaleSvgMetric } from './metrics';
import { renderPanelRectSvg } from './panel';

export function renderTextElementSvg(rendered: ScenarioBaseRenderedElement<ScenarioTextElement>) {
  const { box, element } = rendered;
  const scale = element.frame.width > 0 ? box.width / element.frame.width : 1;
  const fontSize = element.style.fontSize * scale;
  const textAnchor = element.style.align === 'center' ? 'middle' : 'start';
  const x = element.style.align === 'center' ? box.centerX : box.x;
  const y = box.y + fontSize;

  const text = renderTextBlockSvg({
    color: element.style.color,
    fontFamily: 'Inter, Arial, sans-serif',
    fontSize,
    fontWeight: element.style.fontWeight,
    lineHeight: fontSize * 1.25,
    text: element.text,
    width: box.width,
    x,
    y,
  });

  return text.replace('<text ', `<text text-anchor="${textAnchor}" `);
}

export function renderCodeElementSvg(rendered: ScenarioBaseRenderedElement<ScenarioCodeElement>) {
  const { box, element } = rendered;
  const scale = element.frame.width > 0 ? box.width / element.frame.width : 1;
  const fontSize = element.style.fontSize * scale;
  const padding = 24 * scale;
  const x = box.x + padding;
  const y = box.y + 42 * scale;

  const panel = renderPanelRectSvg({
    box,
    fill: element.style.backgroundColor,
    radius: scaleSvgMetric(18, scale),
  });
  const text = renderTextBlockSvg({
    color: element.style.textColor,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize,
    fontWeight: 400,
    height: Math.max(0, box.height - padding * 2),
    lineHeight: fontSize * 1.35,
    text: element.code,
    width: Math.max(0, box.width - padding * 2),
    x,
    y,
  });

  return `${panel}${text}`;
}
