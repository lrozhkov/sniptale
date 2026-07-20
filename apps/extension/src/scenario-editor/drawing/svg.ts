import type { ScenarioDrawingDocument, ScenarioDrawingMark, ScenarioDrawingStroke } from './types';

function escapeSvgAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function renderStrokePath(stroke: ScenarioDrawingStroke): string {
  const [firstPoint, ...restPoints] = stroke.points;
  if (!firstPoint) {
    return '';
  }

  const path = [
    `M ${firstPoint.x} ${firstPoint.y}`,
    ...restPoints.map((point) => `L ${point.x} ${point.y}`),
  ].join(' ');

  return [
    `<path d="${escapeSvgAttribute(path)}" fill="none"`,
    `stroke="${escapeSvgAttribute(stroke.style.color)}"`,
    `stroke-width="${stroke.style.width}"`,
    `stroke-linecap="${stroke.style.lineCap}"`,
    `stroke-linejoin="${stroke.style.lineJoin}"`,
    `opacity="${stroke.style.opacity}"/>`,
  ].join(' ');
}

function renderShape(mark: Extract<ScenarioDrawingMark, { kind: 'shape' }>): string {
  const commonAttributes = [
    `fill="${escapeSvgAttribute(mark.style.fillColor)}"`,
    `stroke="${escapeSvgAttribute(mark.style.color)}"`,
    `stroke-width="${mark.style.width}"`,
    `opacity="${mark.style.opacity}"`,
  ].join(' ');

  if (mark.shape === 'ellipse') {
    return [
      `<ellipse cx="${mark.frame.x + mark.frame.width / 2}"`,
      `cy="${mark.frame.y + mark.frame.height / 2}"`,
      `rx="${mark.frame.width / 2}" ry="${mark.frame.height / 2}" ${commonAttributes}/>`,
    ].join(' ');
  }

  return [
    `<rect x="${mark.frame.x}" y="${mark.frame.y}"`,
    `width="${mark.frame.width}" height="${mark.frame.height}" rx="10" ${commonAttributes}/>`,
  ].join(' ');
}

function renderMark(mark: ScenarioDrawingMark): string {
  switch (mark.kind) {
    case 'shape':
      return renderShape(mark);
    case 'stroke':
      return renderStrokePath(mark);
  }
}

export function renderScenarioDrawingSvg(document: ScenarioDrawingDocument): string {
  return document.marks.map(renderMark).join('');
}
