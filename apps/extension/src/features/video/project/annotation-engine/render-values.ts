import type {
  ResolvedAnnotationFrame,
  ResolvedAnnotationRenderNode,
  ResolvedAnnotationScene,
} from './scene';
import type { VideoAnnotationPrimitiveValue } from './types';

export interface AnnotationSceneRenderFrame {
  height: number;
  width: number;
  x: number;
  y: number;
}

export function clampAnnotationProgress(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function readAnnotationNumber(
  value: VideoAnnotationPrimitiveValue | undefined,
  fallback: number
): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function readAnnotationString(
  value: VideoAnnotationPrimitiveValue | undefined,
  fallback: string
): string {
  return typeof value === 'string' ? value : fallback;
}

export function readAnnotationBoolean(
  value: VideoAnnotationPrimitiveValue | undefined,
  fallback: boolean
): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

export function readAnnotationProgress(
  value: VideoAnnotationPrimitiveValue | undefined,
  fallback = 1
): number {
  return clampAnnotationProgress(readAnnotationNumber(value, fallback));
}

export function resolveAnnotationNodeRenderFrame(
  scene: ResolvedAnnotationScene,
  node: ResolvedAnnotationRenderNode
): ResolvedAnnotationFrame {
  const target = readAnnotationString(node.props['target'], '');
  if (target === 'rect' && scene.target.rect) {
    return {
      ...scene.target.rect,
      opacity: node.frame.opacity,
      rotation: node.frame.rotation,
    };
  }
  if (target === 'point' && scene.target.point) {
    const size = Math.max(node.frame.width, node.frame.height, 1);
    return {
      height: size,
      opacity: node.frame.opacity,
      rotation: node.frame.rotation,
      width: size,
      x: scene.target.point.x - size / 2,
      y: scene.target.point.y - size / 2,
    };
  }
  return node.frame;
}

export function mapAnnotationSceneFrame(params: {
  frame: ResolvedAnnotationFrame | AnnotationSceneRenderFrame;
  scene: ResolvedAnnotationScene;
  sourceFrame?: AnnotationSceneRenderFrame | undefined;
  viewport: AnnotationSceneRenderFrame;
}): AnnotationSceneRenderFrame {
  const sourceFrame = params.sourceFrame ?? params.scene.frame;
  const widthScale = params.viewport.width / Math.max(1, sourceFrame.width);
  const heightScale = params.viewport.height / Math.max(1, sourceFrame.height);

  return {
    height: params.frame.height * heightScale,
    width: params.frame.width * widthScale,
    x: params.viewport.x + (params.frame.x - sourceFrame.x) * widthScale,
    y: params.viewport.y + (params.frame.y - sourceFrame.y) * heightScale,
  };
}
