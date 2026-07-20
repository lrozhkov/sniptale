import type React from 'react';
import {
  mapAnnotationSceneFrame,
  readAnnotationProgress,
  readAnnotationString,
  resolveAnnotationNodeRenderFrame,
  type AnnotationSceneRenderFrame,
  type ResolvedAnnotationRenderNode,
  type ResolvedAnnotationScene,
} from '../../../../features/video/project/annotation-engine';
import { renderAnnotationSceneNodePrimitive } from './annotation-scene-nodes';

interface RenderSceneProps {
  scene: ResolvedAnnotationScene;
  sourceFrame?: AnnotationSceneRenderFrame | undefined;
}

export function renderResolvedAnnotationScene(props: RenderSceneProps) {
  const sourceFrame = props.sourceFrame ?? props.scene.frame;
  const viewport = { height: sourceFrame.height, width: sourceFrame.width, x: 0, y: 0 };

  return (
    <span
      className="pointer-events-none absolute inset-0 block overflow-visible"
      data-annotation-scene={props.scene.clipId}
      data-annotation-scene-phase={props.scene.timeline.phase}
      style={createSceneRootStyle(sourceFrame)}
    >
      {renderSceneNode(props.scene, props.scene.renderTree, viewport, sourceFrame, null)}
    </span>
  );
}

function renderSceneNode(
  scene: ResolvedAnnotationScene,
  node: ResolvedAnnotationRenderNode,
  viewport: AnnotationSceneRenderFrame,
  sourceFrame: AnnotationSceneRenderFrame,
  parentFrame: AnnotationSceneRenderFrame | null
): React.ReactNode {
  const frame = mapAnnotationSceneFrame({
    frame: resolveAnnotationNodeRenderFrame(scene, node),
    scene,
    sourceFrame,
    viewport,
  });
  const localFrame =
    parentFrame === null
      ? frame
      : { ...frame, x: frame.x - parentFrame.x, y: frame.y - parentFrame.y };
  const baseStyle = createNodeBaseStyle(node, localFrame, parentFrame ?? sourceFrame);
  const children = node.children.map((child) =>
    renderSceneNode(scene, child, viewport, sourceFrame, frame)
  );

  return renderAnnotationSceneNodePrimitive({ baseStyle, children, node });
}

function createNodeBaseStyle(
  node: ResolvedAnnotationRenderNode,
  frame: AnnotationSceneRenderFrame,
  parentFrame: AnnotationSceneRenderFrame
): React.CSSProperties {
  const maskProgress = readAnnotationProgress(node.props['maskProgress'], 1);
  const transform = [
    `translate(${createSceneLength(node.transform.x)}, ${createSceneLength(node.transform.y)})`,
    `scale(${node.transform.scale})`,
    `rotate(${node.transform.rotation}deg)`,
  ].join(' ');

  return {
    height: `${(frame.height / Math.max(1, parentFrame.height)) * 100}%`,
    left: `${(frame.x / Math.max(1, parentFrame.width)) * 100}%`,
    opacity: node.opacity * node.frame.opacity,
    overflow: maskProgress < 1 ? 'hidden' : undefined,
    position: 'absolute',
    top: `${(frame.y / Math.max(1, parentFrame.height)) * 100}%`,
    transform,
    transformOrigin: 'center center',
    width: `${(frame.width / Math.max(1, parentFrame.width)) * 100}%`,
    ...createMaskClipStyle(node, maskProgress),
    filter:
      node.transform.blurPx > 0 ? `blur(${createSceneLength(node.transform.blurPx)})` : undefined,
  };
}

function createSceneRootStyle(sourceFrame: AnnotationSceneRenderFrame): React.CSSProperties {
  return {
    containerType: 'size',
    ['--annotation-scene-unit' as string]: `${100 / Math.max(1, sourceFrame.height)}cqh`,
  };
}

function createSceneLength(value: number): string {
  return `calc(${value} * var(--annotation-scene-unit))`;
}

function createMaskClipStyle(
  node: ResolvedAnnotationRenderNode,
  maskProgress: number
): React.CSSProperties {
  if (maskProgress >= 1) {
    return {};
  }
  const direction = readAnnotationString(node.props['maskDirection'], 'right');
  const hidden = `${((1 - maskProgress) * 100).toFixed(2)}%`;
  if (direction === 'left') {
    return { clipPath: `inset(0 0 0 ${hidden})` };
  }
  if (direction === 'up') {
    return { clipPath: `inset(${hidden} 0 0 0)` };
  }
  if (direction === 'down') {
    return { clipPath: `inset(0 0 ${hidden} 0)` };
  }
  return { clipPath: `inset(0 ${hidden} 0 0)` };
}
