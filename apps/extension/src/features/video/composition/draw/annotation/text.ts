import {
  readAnnotationNumber,
  readAnnotationString,
  type AnnotationSceneRenderFrame,
  type ResolvedAnnotationRenderNode,
} from '../../../project/annotation-engine';

export function drawTextNode(
  context: CanvasRenderingContext2D,
  node: ResolvedAnnotationRenderNode,
  frame: AnnotationSceneRenderFrame,
  displayScale: number
) {
  const text = readAnnotationString(node.props['text'], '');
  if (!text) {
    return;
  }

  const fontSize = readAnnotationNumber(node.style['fontSize'], 18) * displayScale;
  const lineHeight = readAnnotationNumber(node.style['lineHeight'], 1.2) * fontSize;
  const maxLines = Math.max(1, Math.floor(frame.height / lineHeight));
  const align = readAnnotationString(node.style['align'], 'left') as CanvasTextAlign;
  const x = align === 'center' ? frame.x + frame.width / 2 : frame.x;

  context.fillStyle = readAnnotationString(node.style['fill'], '#ffffff');
  context.font =
    `${readAnnotationNumber(node.style['weight'], 600)} ${fontSize.toFixed(2)}px ` +
    readAnnotationString(node.style['fontFamily'], 'sans-serif');
  context.textAlign = align;
  context.textBaseline = 'top';
  wrapText(context, text, frame.width, maxLines).forEach((line, index) => {
    context.fillText(
      line,
      align === 'right' ? frame.x + frame.width : x,
      frame.y + index * lineHeight,
      frame.width
    );
  });
}

function wrapText(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number
): string[] {
  return text.split(/\s+/).reduce<string[]>((lines, word) => {
    const current = lines[lines.length - 1] ?? '';
    const next = current ? `${current} ${word}` : word;
    if (lines.length === 0 || context.measureText(next).width <= maxWidth) {
      return [...lines.slice(0, -1), next];
    }
    return lines.length < maxLines ? [...lines, word] : lines;
  }, []);
}
