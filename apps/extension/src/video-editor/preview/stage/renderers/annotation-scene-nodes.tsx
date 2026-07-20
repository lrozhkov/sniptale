import type React from 'react';
import {
  VideoAnnotationRenderNodeKind,
  readAnnotationBoolean,
  readAnnotationNumber,
  readAnnotationProgress,
  readAnnotationString,
  type ResolvedAnnotationRenderNode,
} from '../../../../features/video/project/annotation-engine';

export function renderAnnotationSceneNodePrimitive(params: {
  baseStyle: React.CSSProperties;
  children: React.ReactNode;
  node: ResolvedAnnotationRenderNode;
}) {
  switch (params.node.nodeType) {
    case VideoAnnotationRenderNodeKind.GROUP:
    case VideoAnnotationRenderNodeKind.MASK:
    case VideoAnnotationRenderNodeKind.RECT:
      return renderBoxNode(params.node, params.baseStyle, params.children);
    case VideoAnnotationRenderNodeKind.TEXT:
      return renderTextNode(params.node, params.baseStyle);
    case VideoAnnotationRenderNodeKind.LINE:
    case VideoAnnotationRenderNodeKind.PATH:
      return renderLineNode(params.node, params.baseStyle);
    case VideoAnnotationRenderNodeKind.MARKER:
      return renderMarkerNode(params.node, params.baseStyle);
    case VideoAnnotationRenderNodeKind.FRAME:
      return renderFrameNode(params.node, params.baseStyle);
    case VideoAnnotationRenderNodeKind.SPOTLIGHT:
      return renderSpotlightNode(params.node, params.baseStyle);
    case VideoAnnotationRenderNodeKind.PROGRESS:
      return renderProgressNode(params.node, params.baseStyle);
  }
}

function renderBoxNode(
  node: ResolvedAnnotationRenderNode,
  baseStyle: React.CSSProperties,
  children: React.ReactNode
) {
  return (
    <span
      key={node.id}
      data-annotation-node={node.id}
      data-annotation-node-type={node.nodeType}
      style={{
        ...baseStyle,
        background: readAnnotationString(node.style['fill'], ''),
        border: createBorderStyle(node),
        borderRadius: createSceneLength(readAnnotationNumber(node.style['radius'], 0)),
        boxShadow: createShadowStyle(node),
      }}
    >
      {children}
    </span>
  );
}

function renderTextNode(node: ResolvedAnnotationRenderNode, baseStyle: React.CSSProperties) {
  const align = readAnnotationString(node.style['align'], 'left');
  const backgroundFill = readAnnotationString(node.style['backgroundFill'], '');
  const text = readAnnotationString(node.props['text'], '');
  return (
    <span
      key={node.id}
      data-annotation-node={node.id}
      data-annotation-node-type={node.nodeType}
      style={{
        ...baseStyle,
        alignItems: resolveTextVerticalAlign(node),
        background: backgroundFill || undefined,
        borderRadius: backgroundFill
          ? createSceneLength(readAnnotationNumber(node.style['radius'], 0))
          : undefined,
        boxSizing: 'border-box',
        color: readAnnotationString(node.style['fill'], '#ffffff'),
        display: 'flex',
        fontFamily: readAnnotationString(node.style['fontFamily'], 'Sniptale Sans, sans-serif'),
        fontSize: createSceneLength(readAnnotationNumber(node.style['fontSize'], 18)),
        fontWeight: readAnnotationNumber(node.style['weight'], 600),
        lineHeight: readAnnotationNumber(node.style['lineHeight'], 1.2),
        overflow: 'hidden',
        paddingBlock: createSceneLength(readAnnotationNumber(node.style['paddingY'], 0)),
        paddingInline: createSceneLength(readAnnotationNumber(node.style['paddingX'], 0)),
        textAlign: align as React.CSSProperties['textAlign'],
        visibility: text.trim() ? undefined : 'hidden',
        whiteSpace: 'normal',
      }}
    >
      <span style={{ display: 'block', minWidth: 0, width: '100%' }}>{text}</span>
    </span>
  );
}

function renderLineNode(node: ResolvedAnnotationRenderNode, baseStyle: React.CSSProperties) {
  const progress = readAnnotationProgress(node.props['progress'], 1);
  const stroke = readAnnotationString(node.style['stroke'], '#ffffff');
  const y = 50;
  const endX = progress * 100;

  return (
    <svg
      key={node.id}
      data-annotation-node={node.id}
      data-annotation-node-progress={progress.toFixed(3)}
      data-annotation-node-type={node.nodeType}
      preserveAspectRatio="none"
      style={{ ...baseStyle, overflow: 'visible' }}
      viewBox="0 0 100 100"
    >
      <polyline
        fill="none"
        points={createLinePoints(node, endX, y)}
        stroke={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={readAnnotationNumber(node.style['strokeWidth'], 2)}
      />
      {readAnnotationBoolean(node.props['arrowEnd'], false) ? (
        <polygon fill={stroke} points={`${endX},${y} ${endX - 7},${y - 4} ${endX - 7},${y + 4}`} />
      ) : null}
    </svg>
  );
}

function renderMarkerNode(node: ResolvedAnnotationRenderNode, baseStyle: React.CSSProperties) {
  const ring = readAnnotationString(node.props['variant'], 'dot') === 'ring';
  const fallbackStroke = readAnnotationString(node.style['fill'], '#ffffff');
  const stroke = readAnnotationString(node.style['stroke'], fallbackStroke);
  return (
    <span
      key={node.id}
      data-annotation-node={node.id}
      data-annotation-node-type={node.nodeType}
      style={{
        ...baseStyle,
        background: ring ? undefined : readAnnotationString(node.style['fill'], '#ffffff'),
        border: ring
          ? `${createSceneLength(readAnnotationNumber(node.style['strokeWidth'], 2))} solid ${stroke}`
          : undefined,
        borderRadius: '999px',
      }}
    />
  );
}

function renderFrameNode(node: ResolvedAnnotationRenderNode, baseStyle: React.CSSProperties) {
  return (
    <span
      key={node.id}
      data-annotation-node={node.id}
      data-annotation-node-type={node.nodeType}
      style={{
        ...baseStyle,
        border: createBorderStyle(node, '#ffffff'),
        borderRadius: createSceneLength(readAnnotationNumber(node.style['radius'], 12)),
      }}
    />
  );
}

function renderSpotlightNode(node: ResolvedAnnotationRenderNode, baseStyle: React.CSSProperties) {
  return (
    <span
      key={node.id}
      data-annotation-node={node.id}
      data-annotation-node-type={node.nodeType}
      style={{
        ...baseStyle,
        background: readAnnotationString(node.style['fill'], 'rgba(255,255,255,0.12)'),
        border: createBorderStyle(node),
        borderRadius: '999px',
      }}
    />
  );
}

function renderProgressNode(node: ResolvedAnnotationRenderNode, baseStyle: React.CSSProperties) {
  const progress = readAnnotationProgress(node.props['progress'], 1);
  return (
    <span
      key={node.id}
      data-annotation-node={node.id}
      data-annotation-node-progress={progress.toFixed(3)}
      data-annotation-node-type={node.nodeType}
      style={{
        ...baseStyle,
        background: readAnnotationString(node.style['backgroundFill'], 'rgba(255,255,255,0.16)'),
      }}
    >
      <span
        style={{
          background: readAnnotationString(node.style['fill'], '#ffffff'),
          display: 'block',
          height: '100%',
          width: `${(progress * 100).toFixed(2)}%`,
        }}
      />
    </span>
  );
}

function createLinePoints(node: ResolvedAnnotationRenderNode, endX: number, y: number): string {
  if (readAnnotationString(node.props['path'], 'line') !== 'elbow') {
    return `0,${y} ${endX},${y}`;
  }
  const midX = endX / 2;
  return `0,${y} ${midX},${y} ${midX},100 ${endX},100`;
}

function createBorderStyle(node: ResolvedAnnotationRenderNode, fallback = ''): string | undefined {
  const stroke = readAnnotationString(node.style['stroke'], fallback);
  if (!stroke) {
    return undefined;
  }
  return `${createSceneLength(readAnnotationNumber(node.style['strokeWidth'], 1))} solid ${stroke}`;
}

function createShadowStyle(node: ResolvedAnnotationRenderNode): string | undefined {
  const blur = readAnnotationNumber(node.style['shadowBlur'], 0);
  if (blur <= 0) {
    return undefined;
  }
  const x = readAnnotationNumber(node.style['shadowX'], 0);
  const y = readAnnotationNumber(node.style['shadowY'], 0);
  const color = readAnnotationString(node.style['shadowColor'], 'rgba(0,0,0,0.2)');
  return `${createSceneLength(x)} ${createSceneLength(y)} ${createSceneLength(blur)} ${color}`;
}

function createSceneLength(value: number): string {
  return `calc(${value} * var(--annotation-scene-unit))`;
}

function resolveTextVerticalAlign(
  node: ResolvedAnnotationRenderNode
): React.CSSProperties['alignItems'] {
  const verticalAlign = readAnnotationString(node.style['verticalAlign'], 'center');
  if (verticalAlign === 'top') {
    return 'flex-start';
  }
  if (verticalAlign === 'bottom') {
    return 'flex-end';
  }
  return 'center';
}
