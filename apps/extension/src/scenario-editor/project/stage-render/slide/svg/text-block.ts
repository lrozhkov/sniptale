import { escapeSvgAttribute, escapeSvgText } from './escape';
import { formatSvgMetric } from './metrics';
import { resolveSvgPaint } from './paint';

interface ScenarioSvgTextBlock {
  color: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  height?: number;
  lineHeight: number;
  text: string;
  width?: number;
  x: number;
  y: number;
}

function estimateTextWidth(text: string, fontSize: number): number {
  return text.length * fontSize * 0.56;
}

function wrapLine(line: string, width: number | undefined, fontSize: number): string[] {
  if (!width || estimateTextWidth(line, fontSize) <= width) {
    return [line];
  }

  const words = line.split(/\s+/).filter(Boolean);
  const wrapped: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (!current || estimateTextWidth(candidate, fontSize) <= width) {
      current = candidate;
      continue;
    }

    wrapped.push(current);
    current = word;
  }

  if (current) {
    wrapped.push(current);
  }

  return wrapped;
}

function getVisibleLines(block: ScenarioSvgTextBlock): string[] {
  const lines = block.text
    .split('\n')
    .flatMap((line) => wrapLine(line, block.width, block.fontSize));
  if (!block.height) {
    return lines;
  }

  const maxLines = Math.max(1, Math.floor(block.height / block.lineHeight));
  return lines.slice(0, maxLines);
}

export function renderTextBlockSvg(block: ScenarioSvgTextBlock): string {
  const color = resolveSvgPaint(block.color, '#111111');
  const lines = getVisibleLines(block)
    .map((line, index) => {
      const y = block.y + index * block.lineHeight;
      return `<tspan x="${formatSvgMetric(block.x)}" y="${formatSvgMetric(y)}">${escapeSvgText(
        line
      )}</tspan>`;
    })
    .join('');

  return [
    `<text x="${formatSvgMetric(block.x)}" y="${formatSvgMetric(block.y)}"`,
    `fill="${escapeSvgAttribute(color)}"`,
    `font-family="${escapeSvgAttribute(block.fontFamily)}"`,
    `font-size="${formatSvgMetric(block.fontSize)}"`,
    `font-weight="${block.fontWeight}">${lines}</text>`,
  ].join(' ');
}
