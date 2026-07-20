import type { ScenarioRenderedElement, ScenarioSlideRenderResult } from '../types';
import { escapeSvgAttribute } from './escape';
import { renderScenarioElementSvg } from './element';
import { resolveSvgPaint } from './paint';

function renderElementGroup(rendered: ScenarioRenderedElement): string {
  const opacity = Math.max(0, Math.min(1, rendered.element.opacity));
  const selected = rendered.selected ? 'true' : 'false';
  const attributes = [
    `data-scenario-element-id="${escapeSvgAttribute(rendered.element.id)}"`,
    `data-scenario-element-kind="${escapeSvgAttribute(rendered.element.kind)}"`,
    `data-scenario-selected="${selected}"`,
    `opacity="${opacity}"`,
  ]
    .filter(Boolean)
    .join(' ');

  return `<g ${attributes}>${renderScenarioElementSvg(rendered)}</g>`;
}

export function renderScenarioSlideSvgDocument(result: Omit<ScenarioSlideRenderResult, 'svg'>) {
  const { canvas, elements } = result;
  const body = elements.map(renderElementGroup).join('');
  const backgroundColor = resolveSvgPaint(canvas.backgroundColor, '#f3ede2');
  const defs = [
    '<defs><marker id="scenario-arrow-head"',
    'markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto">',
    '<path d="M 0 0 L 10 5 L 0 10 z" fill="#b86024"/></marker></defs>',
  ].join(' ');

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}"`,
    `viewBox="0 0 ${canvas.width} ${canvas.height}" role="img"`,
    `aria-label="${escapeSvgAttribute(result.slide.title)}">`,
    `${defs}<rect width="100%" height="100%" fill="${escapeSvgAttribute(
      backgroundColor
    )}"/>${body}</svg>`,
  ].join(' ');
}
