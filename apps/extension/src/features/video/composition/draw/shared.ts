export type RoundedRectPathShape = 'full' | 'left' | 'right';

function lineToTopRightCorner(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  radius: number
): void {
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
}

function lineToBottomRightCorner(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
}

function lineToBottomLeftCorner(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  height: number,
  radius: number
): void {
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
}

function lineToTopLeftCorner(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number
): void {
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
}

export function drawRoundedRectPath(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  lineToTopRightCorner(context, x, y, width, safeRadius);
  lineToBottomRightCorner(context, x, y, width, height, safeRadius);
  context.lineTo(x + safeRadius, y + height);
  lineToBottomLeftCorner(context, x, y, height, safeRadius);
  lineToTopLeftCorner(context, x, y, safeRadius);
  context.closePath();
}

export function drawRoundedRectSidePath(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  shape: RoundedRectPathShape
): void {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  if (shape === 'full') {
    drawRoundedRectPath(context, x, y, width, height, safeRadius);
    return;
  }

  context.beginPath();
  if (shape === 'left') {
    context.moveTo(x + safeRadius, y);
    context.lineTo(x + width, y);
    context.lineTo(x + width, y + height);
    context.lineTo(x + safeRadius, y + height);
    lineToBottomLeftCorner(context, x, y, height, safeRadius);
    lineToTopLeftCorner(context, x, y, safeRadius);
    context.closePath();
    return;
  }

  context.moveTo(x, y);
  lineToTopRightCorner(context, x, y, width, safeRadius);
  lineToBottomRightCorner(context, x, y, width, height, safeRadius);
  context.lineTo(x, y + height);
  context.lineTo(x, y);
  context.closePath();
}

export function wrapText(
  context: CanvasRenderingContext2D,
  text: string,
  font: string,
  maxWidth: number
): string[] {
  context.font = font;
  const normalized = text.replace(/\r/g, '');
  const paragraphs = normalized.split('\n');
  const lines: string[] = [];

  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push('');
      continue;
    }

    const [firstWord, ...restWords] = words;
    if (!firstWord) {
      lines.push('');
      continue;
    }

    let currentLine = firstWord;
    for (const word of restWords) {
      const testLine = `${currentLine} ${word}`;
      if (context.measureText(testLine).width <= maxWidth) {
        currentLine = testLine;
      } else {
        lines.push(currentLine);
        currentLine = word;
      }
    }

    lines.push(currentLine);
  }

  return lines;
}
