import {
  mapAnnotationSceneFrame,
  readAnnotationProgress,
  readAnnotationString,
  resolveAnnotationNodeRenderFrame,
  VideoAnnotationTargetBindingKind,
  type AnnotationSceneRenderFrame,
  type ResolvedAnnotationRenderNode,
  type ResolvedAnnotationScene,
} from '../../../project/annotation-engine';
import { drawAnnotationScenePrimitive } from './primitives';

interface DrawSceneParams {
  clipViewport?: boolean | undefined;
  context: CanvasRenderingContext2D;
  displayScale: number;
  scene: ResolvedAnnotationScene;
  sourceFrame?: AnnotationSceneRenderFrame | undefined;
  viewport: AnnotationSceneRenderFrame;
}

export function drawResolvedAnnotationScene(params: DrawSceneParams): void {
  const { context, scene, viewport } = params;
  const maskProgress = readAnnotationProgress(scene.effects.maskProgress, 1);
  const bodyViewport = isTargetSceneBodyViewport(scene, viewport);
  const clipViewport = params.clipViewport ?? !bodyViewport;
  const sourceFrame =
    params.sourceFrame ?? (bodyViewport ? scene.presentation.labelFrame : scene.frame);

  context.save();
  if (clipViewport) {
    context.beginPath();
    context.rect(viewport.x, viewport.y, viewport.width * maskProgress, viewport.height);
    context.clip();
  }
  applyScenePresentationEffects(context, scene, viewport, params.displayScale);
  drawResolvedAnnotationNode({ ...params, sourceFrame }, scene.renderTree);
  context.restore();
}

function isTargetSceneBodyViewport(
  scene: ResolvedAnnotationScene,
  viewport: AnnotationSceneRenderFrame
): boolean {
  const labelFrame = scene.presentation.labelFrame;
  return (
    scene.target.binding !== VideoAnnotationTargetBindingKind.NONE &&
    viewport.height === labelFrame.height &&
    viewport.width === labelFrame.width &&
    viewport.x === labelFrame.x &&
    viewport.y === labelFrame.y
  );
}

function applyScenePresentationEffects(
  context: CanvasRenderingContext2D,
  scene: ResolvedAnnotationScene,
  viewport: AnnotationSceneRenderFrame,
  displayScale: number
) {
  const { effects } = scene;
  const centerX = viewport.x + viewport.width / 2;
  const centerY = viewport.y + viewport.height / 2;

  if (effects.blurPx > 0) {
    context.filter = `blur(${(effects.blurPx * displayScale).toFixed(2)}px)`;
  }
  context.translate(
    centerX + effects.translateX * displayScale,
    centerY + effects.translateY * displayScale
  );
  context.scale(effects.scaleMultiplier, effects.scaleMultiplier);
  context.translate(-centerX, -centerY);
}

function drawResolvedAnnotationNode(params: DrawSceneParams, node: ResolvedAnnotationRenderNode) {
  const { context, scene } = params;
  const frame = mapAnnotationSceneFrame({
    frame: resolveAnnotationNodeRenderFrame(scene, node),
    scene,
    sourceFrame: params.sourceFrame,
    viewport: params.viewport,
  });
  const opacity = node.opacity * node.frame.opacity;

  if (opacity <= 0 || frame.width <= 0 || frame.height <= 0) {
    return;
  }

  context.save();
  context.globalAlpha *= opacity;
  applyNodeClip(context, node, frame);
  applyNodeTransform(context, node, frame, params.displayScale);
  drawAnnotationScenePrimitive(params.context, node, frame, params.displayScale);
  node.children.forEach((child) => drawResolvedAnnotationNode(params, child));
  context.restore();
}

function applyNodeTransform(
  context: CanvasRenderingContext2D,
  node: ResolvedAnnotationRenderNode,
  frame: AnnotationSceneRenderFrame,
  displayScale: number
) {
  const centerX = frame.x + frame.width / 2;
  const centerY = frame.y + frame.height / 2;

  context.translate(
    centerX + node.transform.x * displayScale,
    centerY + node.transform.y * displayScale
  );
  if (node.transform.scale !== 1) {
    context.scale(node.transform.scale, node.transform.scale);
  }
  if (node.transform.rotation !== 0) {
    context.rotate((node.transform.rotation * Math.PI) / 180);
  }
  context.translate(-centerX, -centerY);
  if (node.transform.blurPx > 0) {
    context.filter = `blur(${(node.transform.blurPx * displayScale).toFixed(2)}px)`;
  }
}

function applyNodeClip(
  context: CanvasRenderingContext2D,
  node: ResolvedAnnotationRenderNode,
  frame: AnnotationSceneRenderFrame
) {
  const maskProgress = readAnnotationProgress(node.props['maskProgress'], 1);
  if (maskProgress >= 1) {
    return;
  }

  const direction = readAnnotationString(node.props['maskDirection'], 'right');
  const horizontal = direction === 'left' || direction === 'right';
  const vertical = direction === 'up' || direction === 'down';
  const width = horizontal ? frame.width * maskProgress : frame.width;
  const height = vertical ? frame.height * maskProgress : frame.height;
  const x = direction === 'left' ? frame.x + frame.width - width : frame.x;
  const y = direction === 'up' ? frame.y + frame.height - height : frame.y;

  context.beginPath();
  context.rect(x, y, width, height);
  context.clip();
}
