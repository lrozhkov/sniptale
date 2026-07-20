import {
  VideoAnnotationRenderNodeKind,
  readAnnotationBoolean,
  readAnnotationNumber,
  readAnnotationProgress,
  readAnnotationString,
  type AnnotationSceneRenderFrame,
  type ResolvedAnnotationRenderNode,
} from '../../../project/annotation-engine';
import {
  drawFrameNode,
  drawMarkerNode,
  drawProgressNode,
  drawSpotlightNode,
  drawSurface,
} from './primitive-shapes';
import { drawTextNode } from './text';

export function drawAnnotationScenePrimitive(
  context: CanvasRenderingContext2D,
  node: ResolvedAnnotationRenderNode,
  frame: AnnotationSceneRenderFrame,
  displayScale: number
) {
  switch (node.nodeType) {
    case VideoAnnotationRenderNodeKind.GROUP:
    case VideoAnnotationRenderNodeKind.MASK:
    case VideoAnnotationRenderNodeKind.RECT:
      drawSurface(context, node, frame);
      break;
    case VideoAnnotationRenderNodeKind.TEXT:
      drawTextNode(context, node, frame, displayScale);
      break;
    case VideoAnnotationRenderNodeKind.LINE:
    case VideoAnnotationRenderNodeKind.PATH:
      drawLineNode(context, node, frame, displayScale);
      break;
    case VideoAnnotationRenderNodeKind.MARKER:
      drawMarkerNode(context, node, frame, displayScale);
      break;
    case VideoAnnotationRenderNodeKind.FRAME:
      drawFrameNode(context, node, frame, displayScale);
      break;
    case VideoAnnotationRenderNodeKind.SPOTLIGHT:
      drawSpotlightNode(context, node, frame, displayScale);
      break;
    case VideoAnnotationRenderNodeKind.PROGRESS:
      drawProgressNode(context, node, frame);
      break;
  }
}

function drawLineNode(
  context: CanvasRenderingContext2D,
  node: ResolvedAnnotationRenderNode,
  frame: AnnotationSceneRenderFrame,
  displayScale: number
) {
  const progress = readAnnotationProgress(node.props['progress'], 1);
  const y = frame.y + frame.height / 2;
  const endX = frame.x + frame.width * progress;

  context.beginPath();
  context.moveTo(frame.x, y);
  if (readAnnotationString(node.props['path'], 'line') === 'elbow') {
    drawElbowPath(context, frame, endX, y, progress);
  } else {
    context.lineTo(endX, y);
  }
  context.strokeStyle = readAnnotationString(node.style['stroke'], '#ffffff');
  context.lineWidth = readAnnotationNumber(node.style['strokeWidth'], 2) * displayScale;
  context.stroke();
  if (readAnnotationBoolean(node.props['arrowEnd'], false) && progress > 0) {
    drawArrowHead(context, endX, y, displayScale, node);
  }
}

function drawElbowPath(
  context: CanvasRenderingContext2D,
  frame: AnnotationSceneRenderFrame,
  endX: number,
  y: number,
  progress: number
) {
  const midX = frame.x + (frame.width * progress) / 2;
  context.lineTo(midX, y);
  context.lineTo(midX, frame.y + frame.height);
  context.lineTo(endX, frame.y + frame.height);
}

function drawArrowHead(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  displayScale: number,
  node: ResolvedAnnotationRenderNode
) {
  const size = readAnnotationNumber(node.props['arrowSize'], 8) * displayScale;
  context.beginPath();
  context.moveTo(x, y);
  context.lineTo(x - size, y - size / 2);
  context.lineTo(x - size, y + size / 2);
  context.closePath();
  context.fillStyle = readAnnotationString(node.style['stroke'], '#ffffff');
  context.fill();
}
