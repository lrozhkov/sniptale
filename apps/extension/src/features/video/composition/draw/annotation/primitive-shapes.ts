import {
  readAnnotationNumber,
  readAnnotationProgress,
  readAnnotationString,
  type AnnotationSceneRenderFrame,
  type ResolvedAnnotationRenderNode,
} from '../../../project/annotation-engine';

export function drawSurface(
  context: CanvasRenderingContext2D,
  node: ResolvedAnnotationRenderNode,
  frame: AnnotationSceneRenderFrame
) {
  const fill = readAnnotationString(node.style['fill'], '');
  const stroke = readAnnotationString(node.style['stroke'], '');
  if (!fill && !stroke) {
    return;
  }

  drawRoundedRectPath(context, frame, readAnnotationNumber(node.style['radius'], 0));
  applyShadow(context, node);
  if (fill) {
    context.fillStyle = fill;
    context.fill();
  }
  if (stroke) {
    context.strokeStyle = stroke;
    context.lineWidth = readAnnotationNumber(node.style['strokeWidth'], 1);
    context.stroke();
  }
}

export function drawMarkerNode(
  context: CanvasRenderingContext2D,
  node: ResolvedAnnotationRenderNode,
  frame: AnnotationSceneRenderFrame,
  displayScale: number
) {
  const radius = Math.max(1, Math.min(frame.width, frame.height) / 2);
  context.beginPath();
  context.arc(frame.x + frame.width / 2, frame.y + frame.height / 2, radius, 0, Math.PI * 2);
  if (readAnnotationString(node.props['variant'], 'dot') === 'ring') {
    context.strokeStyle = readAnnotationString(
      node.style['stroke'],
      readAnnotationString(node.style['fill'], '#ffffff')
    );
    context.lineWidth = readAnnotationNumber(node.style['strokeWidth'], 2) * displayScale;
    context.stroke();
    return;
  }
  context.fillStyle = readAnnotationString(node.style['fill'], '#ffffff');
  context.fill();
}

export function drawFrameNode(
  context: CanvasRenderingContext2D,
  node: ResolvedAnnotationRenderNode,
  frame: AnnotationSceneRenderFrame,
  displayScale: number
) {
  context.strokeStyle = readAnnotationString(node.style['stroke'], '#ffffff');
  context.lineWidth = readAnnotationNumber(node.style['strokeWidth'], 2) * displayScale;
  if (readAnnotationString(node.props['variant'], 'rect') === 'bracket') {
    drawBracketFrame(context, frame);
    return;
  }
  drawRoundedRectPath(
    context,
    frame,
    readAnnotationNumber(node.style['radius'], 12) * displayScale
  );
  context.stroke();
}

export function drawSpotlightNode(
  context: CanvasRenderingContext2D,
  node: ResolvedAnnotationRenderNode,
  frame: AnnotationSceneRenderFrame,
  displayScale: number
) {
  context.beginPath();
  context.arc(
    frame.x + frame.width / 2,
    frame.y + frame.height / 2,
    Math.max(frame.width, frame.height) / 2,
    0,
    Math.PI * 2
  );
  context.fillStyle = readAnnotationString(node.style['fill'], 'rgba(255,255,255,0.12)');
  context.fill();
  context.strokeStyle = readAnnotationString(node.style['stroke'], '#ffffff');
  context.lineWidth = readAnnotationNumber(node.style['strokeWidth'], 1) * displayScale;
  context.stroke();
}

export function drawProgressNode(
  context: CanvasRenderingContext2D,
  node: ResolvedAnnotationRenderNode,
  frame: AnnotationSceneRenderFrame
) {
  const background = readAnnotationString(node.style['backgroundFill'], '');
  if (background) {
    context.fillStyle = background;
    context.fillRect(frame.x, frame.y, frame.width, frame.height);
  }
  context.fillStyle = readAnnotationString(node.style['fill'], '#ffffff');
  context.fillRect(
    frame.x,
    frame.y,
    frame.width * readAnnotationProgress(node.props['progress']),
    frame.height
  );
}

function drawBracketFrame(context: CanvasRenderingContext2D, frame: AnnotationSceneRenderFrame) {
  const length = Math.min(frame.width, frame.height) * 0.22;
  const corners = createBracketCorners(frame, length);

  context.beginPath();
  corners.forEach(([moveX, moveY, lineX, lineY, nextX, nextY]) => {
    context.moveTo(moveX, moveY);
    context.lineTo(lineX, lineY);
    context.moveTo(moveX, moveY);
    context.lineTo(nextX, nextY);
  });
  context.stroke();
}

type BracketCorner = readonly [number, number, number, number, number, number];

function createBracketCorners(
  frame: AnnotationSceneRenderFrame,
  length: number
): readonly BracketCorner[] {
  return [
    [frame.x, frame.y, frame.x + length, frame.y, frame.x, frame.y + length],
    [
      frame.x + frame.width,
      frame.y,
      frame.x + frame.width - length,
      frame.y,
      frame.x + frame.width,
      frame.y + length,
    ],
    [
      frame.x,
      frame.y + frame.height,
      frame.x + length,
      frame.y + frame.height,
      frame.x,
      frame.y + frame.height - length,
    ],
    [
      frame.x + frame.width,
      frame.y + frame.height,
      frame.x + frame.width - length,
      frame.y + frame.height,
      frame.x + frame.width,
      frame.y + frame.height - length,
    ],
  ];
}

function drawRoundedRectPath(
  context: CanvasRenderingContext2D,
  frame: AnnotationSceneRenderFrame,
  radius: number
) {
  const resolvedRadius = Math.min(radius, frame.width / 2, frame.height / 2);
  context.beginPath();
  context.moveTo(frame.x + resolvedRadius, frame.y);
  context.lineTo(frame.x + frame.width - resolvedRadius, frame.y);
  context.quadraticCurveTo(
    frame.x + frame.width,
    frame.y,
    frame.x + frame.width,
    frame.y + resolvedRadius
  );
  context.lineTo(frame.x + frame.width, frame.y + frame.height - resolvedRadius);
  context.quadraticCurveTo(
    frame.x + frame.width,
    frame.y + frame.height,
    frame.x + frame.width - resolvedRadius,
    frame.y + frame.height
  );
  context.lineTo(frame.x + resolvedRadius, frame.y + frame.height);
  context.quadraticCurveTo(
    frame.x,
    frame.y + frame.height,
    frame.x,
    frame.y + frame.height - resolvedRadius
  );
  context.lineTo(frame.x, frame.y + resolvedRadius);
  context.quadraticCurveTo(frame.x, frame.y, frame.x + resolvedRadius, frame.y);
  context.closePath();
}

function applyShadow(context: CanvasRenderingContext2D, node: ResolvedAnnotationRenderNode) {
  const blur = readAnnotationNumber(node.style['shadowBlur'], 0);
  if (blur <= 0) {
    return;
  }
  context.shadowBlur = blur;
  context.shadowColor = readAnnotationString(node.style['shadowColor'], 'rgba(0,0,0,0.2)');
  context.shadowOffsetX = readAnnotationNumber(node.style['shadowX'], 0);
  context.shadowOffsetY = readAnnotationNumber(node.style['shadowY'], 0);
}
