import {
  type VideoAnnotationPackTheme,
  type VideoAnnotationPrimitiveValue,
  type VideoAnnotationRenderNode,
  type VideoAnnotationTemplate,
} from './types';
import type {
  AnnotationSceneResolvableClip,
  ResolvedAnnotationFrame,
  ResolvedAnnotationRenderNode,
  ResolvedAnnotationTimelineState,
} from './scene';
import {
  DEFAULT_NODE_TRANSFORM,
  applyNodeValues,
  readNumber,
  resolveNodeFrame,
} from './node-values';
import type { VideoProjectAnnotationContent } from '../types/annotation';
import type { VideoProjectAnnotationStyle } from '../types/layout';
import { resolveControlState, type ResolvedControlState } from './control-state';

export function resolveAnnotationRenderTree(params: {
  clip: AnnotationSceneResolvableClip;
  labelFrame: ResolvedAnnotationFrame;
  style: VideoProjectAnnotationStyle;
  template: VideoAnnotationTemplate;
  theme?: VideoAnnotationPackTheme | undefined;
  timeline: ResolvedAnnotationTimelineState;
}): ResolvedAnnotationRenderNode {
  const controlState = resolveControlState(params);
  return resolveNode({
    controlState,
    node: params.template.renderTree,
    orderRef: { value: 0 },
    parentFrame: params.labelFrame,
    timeline: params.timeline,
  });
}

export function flattenResolvedAnnotationNodes(
  root: ResolvedAnnotationRenderNode
): readonly ResolvedAnnotationRenderNode[] {
  return [root, ...root.children.flatMap((child) => flattenResolvedAnnotationNodes(child))];
}

function resolveNode(params: {
  controlState: ResolvedControlState;
  node: VideoAnnotationRenderNode;
  orderRef: { value: number };
  parentFrame: ResolvedAnnotationFrame;
  timeline: ResolvedAnnotationTimelineState;
}): ResolvedAnnotationRenderNode {
  const order = params.orderRef.value;
  params.orderRef.value += 1;

  const baseProps = resolvePrimitiveRecord(params.node.props, params.controlState);
  const baseStyle = resolvePrimitiveRecord(params.node.style, params.controlState);
  const frame = resolveNodeFrame(params.node, params.parentFrame);
  const nodeControls = params.controlState.nodeValues.get(params.node.id) ?? {};
  const timelineTracks = params.timeline.effects.filter(
    (effect) => effect.targetNodeId === params.node.id
  );
  const withControls = applyNodeValues(
    {
      children: [],
      frame,
      id: params.node.id,
      nodeType: params.node.nodeType,
      opacity: readNumber(baseStyle['opacity'], 1),
      order,
      props: baseProps,
      style: baseStyle,
      transform: { ...DEFAULT_NODE_TRANSFORM },
    },
    Object.entries(nodeControls).map(([property, value]) => ({ property, value })),
    params.parentFrame
  );
  const resolved = applyNodeValues(withControls, timelineTracks, params.parentFrame, 'transform');

  return {
    ...resolved,
    children: (params.node.children ?? []).map((child) =>
      resolveNode({
        controlState: params.controlState,
        node: child,
        orderRef: params.orderRef,
        parentFrame: resolved.frame,
        timeline: params.timeline,
      })
    ),
  };
}

function resolvePrimitiveRecord(
  record: Record<string, VideoAnnotationPrimitiveValue> | undefined,
  controlState: ResolvedControlState
): Record<string, VideoAnnotationPrimitiveValue> {
  return Object.fromEntries(
    Object.entries(record ?? {}).map(([key, value]) => [
      key,
      resolvePrimitiveValue(value, controlState),
    ])
  );
}

function resolvePrimitiveValue(
  value: VideoAnnotationPrimitiveValue,
  controlState: ResolvedControlState
): VideoAnnotationPrimitiveValue {
  if (typeof value !== 'string') {
    return value;
  }
  if (value.startsWith('token:')) {
    return controlState.themeTokens.get(value.slice('token:'.length)) ?? value;
  }
  if (value.startsWith('field:')) {
    return resolveContentField(value, controlState.content);
  }
  return value;
}

function resolveContentField(value: string, content: VideoProjectAnnotationContent): string | null {
  const [, field] = value.split(':');
  if (!field) {
    return value;
  }
  switch (field) {
    case 'badge':
      return content.badge;
    case 'headline':
      return content.headline;
    case 'subline':
      return content.subline;
    default:
      return value;
  }
}
