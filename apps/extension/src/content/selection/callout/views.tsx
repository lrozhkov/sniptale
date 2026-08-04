import React from 'react';
import { createPortal } from 'react-dom';
import { translate } from '../../../platform/i18n';
import type { AppTheme } from '../../../ui/theme';
import { mergeThemeScopedStyle } from '@sniptale/ui/theme/safe-portal';
import { ProductGlassToolbar, ProductGlassToolbarButton } from '@sniptale/ui/product-glass-toolbar';
import { resolveContentPortalTarget } from '../interactive-frame/layout/portal';
import type { getDynamicTailState } from './dynamic-tail';
import type { getLineConnectorState } from './line-connector';
import type {
  CalloutConnectorMarker,
  CalloutVisualStyle,
} from '@sniptale/runtime-contracts/highlighter/callout';
import { getCalloutStrokeDasharray } from '../../../features/highlighter/callout-stroke';
import { getCalloutAccentEdgePath } from '../../../features/highlighter/callout-accent-edge';
import {
  projectCalloutLineCustomCss,
  type ResolvedCalloutCustomCss,
} from '../../../features/highlighter/callout-custom-css';

type CalloutConnectorState =
  | ReturnType<typeof getDynamicTailState>
  | ReturnType<typeof getLineConnectorState>;

function getCalloutToolbarWrapperStyle(rect: DOMRect, zIndex: number): React.CSSProperties {
  return {
    position: 'fixed',
    top: rect.top - 46,
    left: rect.left + rect.width / 2 - 62,
    zIndex,
  };
}

export function renderCalloutFloatingToolbar(props: {
  applyFormatting: (command: string, event: React.MouseEvent) => void;
  effectiveZIndex: number;
  floatingToolbarRect: DOMRect | null;
  isEditing: boolean;
  portalTheme: AppTheme | null;
  resolveThemeOwner: () => HTMLElement | null;
}) {
  if (!props.floatingToolbarRect || !props.isEditing) {
    return null;
  }

  return createPortal(
    <div
      data-theme={props.portalTheme ?? undefined}
      style={mergeThemeScopedStyle(
        props.portalTheme,
        getCalloutToolbarWrapperStyle(props.floatingToolbarRect, props.effectiveZIndex)
      )}
    >
      <ProductGlassToolbar
        className="sniptale-callout-format-toolbar"
        onMouseDown={(event) => event.preventDefault()}
      >
        <ProductGlassToolbarButton
          onMouseDown={(event) => props.applyFormatting('bold', event)}
          style={{ fontSize: 14, fontWeight: 700 }}
          title={translate('content.interactiveFrame.formatBold')}
        >
          B
        </ProductGlassToolbarButton>
        <ProductGlassToolbarButton
          onMouseDown={(event) => props.applyFormatting('italic', event)}
          style={{ fontSize: 14, fontStyle: 'italic' }}
          title={translate('content.interactiveFrame.formatItalic')}
        >
          I
        </ProductGlassToolbarButton>
        <ProductGlassToolbarButton
          onMouseDown={(event) => props.applyFormatting('underline', event)}
          style={{ fontSize: 14, textDecoration: 'underline' }}
          title={translate('content.interactiveFrame.formatUnderline')}
        >
          U
        </ProductGlassToolbarButton>
      </ProductGlassToolbar>
    </div>,
    resolveContentPortalTarget(props.resolveThemeOwner())
  );
}

export function renderDynamicCalloutTail(
  tail: CalloutConnectorState | null,
  style: CalloutVisualStyle,
  customStyles?: ResolvedCalloutCustomCss
) {
  if (!tail) return null;
  if (tail.kind === 'line') {
    const connectorCustomStyles = projectCalloutLineCustomCss(customStyles?.connector ?? {});
    return (
      <svg
        className="sniptale-callout-dynamic-tail"
        aria-hidden="true"
        focusable="false"
        preserveAspectRatio="xMinYMin meet"
        style={tail.style}
        viewBox={tail.viewBox}
      >
        <path
          d={tail.path}
          fill="none"
          pointerEvents="stroke"
          stroke="transparent"
          strokeWidth={18}
        />
        <g style={connectorCustomStyles.group}>
          <path
            data-ui="content.callout.connector-line"
            d={tail.path}
            fill="none"
            pointerEvents="none"
            stroke={style.connector.color}
            strokeDasharray={getCalloutStrokeDasharray(
              style.connector.lineStyle,
              style.connector.width
            )}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={style.connector.width}
            style={connectorCustomStyles.line}
          />
          {renderConnectorMarker(
            style.connector.blockMarker,
            tail.blockPoint,
            style.connector.color,
            tail.blockAngle,
            style.connector.blockMarkerSize
          )}
          {renderConnectorMarker(
            style.connector.frameMarker,
            tail.framePoint,
            style.connector.color,
            tail.frameAngle,
            style.connector.frameMarkerSize
          )}
        </g>
      </svg>
    );
  }
  return (
    <svg
      className="sniptale-callout-dynamic-tail"
      aria-hidden="true"
      focusable="false"
      preserveAspectRatio="xMinYMin meet"
      style={tail.style}
      viewBox={tail.viewBox}
    >
      <path
        d={tail.path}
        fill="none"
        pointerEvents="stroke"
        stroke="transparent"
        strokeWidth={18}
      />
      {style.surface.borderWidth > 0 ? (
        <path
          data-ui="content.callout.tail-outline"
          d={tail.outlinePath}
          fill={style.surface.backgroundColor}
          pointerEvents="none"
          stroke={style.surface.borderColor}
          strokeDasharray={getCalloutStrokeDasharray(
            style.surface.borderStyle,
            style.surface.borderWidth
          )}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={style.surface.borderWidth}
          style={customStyles?.connector}
        />
      ) : (
        <path
          d={tail.path}
          fill={style.surface.backgroundColor}
          pointerEvents="none"
          style={customStyles?.connector}
        />
      )}
    </svg>
  );
}

export function renderCalloutAccentEdge(
  style: CalloutVisualStyle,
  dimensions: { width: number; height: number },
  customStyles?: ResolvedCalloutCustomCss
) {
  return (
    <CalloutAccentEdgeView customStyles={customStyles} dimensions={dimensions} style={style} />
  );
}

function CalloutAccentEdgeView(props: {
  customStyles: ResolvedCalloutCustomCss | undefined;
  dimensions: { width: number; height: number };
  style: CalloutVisualStyle;
}) {
  const clipId = `sniptale-callout-accent-${React.useId().replaceAll(':', '')}`;
  const { dimensions, style } = props;
  const accent = style.accentEdge;
  if (!accent.enabled || dimensions.width <= 0 || dimensions.height <= 0) return null;
  const path = getCalloutAccentEdgePath({
    rect: { x: 0, y: 0, ...dimensions },
    side: accent.side,
  });
  return (
    <svg
      aria-hidden="true"
      data-ui="content.callout.accent-edge"
      height={dimensions.height}
      pointerEvents="none"
      style={{ position: 'absolute', inset: 0, overflow: 'visible', zIndex: 2 }}
      width={dimensions.width}
    >
      <defs>
        <clipPath id={clipId} clipPathUnits="userSpaceOnUse">
          <rect height={dimensions.height} rx={style.surface.radius} width={dimensions.width} />
        </clipPath>
      </defs>
      <path
        clipPath={`url(#${clipId})`}
        d={path}
        fill="none"
        stroke={accent.color}
        strokeDasharray={getCalloutStrokeDasharray(accent.lineStyle, accent.width)}
        strokeLinecap={accent.lineStyle === 'dotted' ? 'round' : 'butt'}
        strokeLinejoin="round"
        strokeWidth={accent.width * 2}
        style={props.customStyles?.accent}
      />
    </svg>
  );
}

function renderConnectorMarker(
  marker: CalloutConnectorMarker,
  point: { x: number; y: number },
  color: string,
  angle: number,
  size: number
) {
  if (marker === 'none') return null;
  const halfSize = size / 2;
  if (marker === 'circle') {
    return <circle cx={point.x} cy={point.y} r={halfSize} fill={color} pointerEvents="none" />;
  }
  if (marker === 'ring-dot') {
    const ringStrokeWidth = Number(Math.max(1, size * 0.12).toFixed(2));
    const dotRadius = Number(Math.max(1, size * 0.14).toFixed(2));
    return (
      <g pointerEvents="none">
        <circle
          cx={point.x}
          cy={point.y}
          fill="none"
          r={halfSize}
          stroke={color}
          strokeWidth={ringStrokeWidth}
        />
        <circle cx={point.x} cy={point.y} fill={color} r={dotRadius} />
      </g>
    );
  }
  if (marker === 'square') {
    return (
      <rect
        fill={color}
        height={size}
        pointerEvents="none"
        width={size}
        x={point.x - halfSize}
        y={point.y - halfSize}
      />
    );
  }
  if (marker === 'diamond') {
    return (
      <polygon
        points={
          `${point.x + halfSize},${point.y} ${point.x},${point.y + halfSize} ` +
          `${point.x - halfSize},${point.y} ${point.x},${point.y - halfSize}`
        }
        fill={color}
        pointerEvents="none"
      />
    );
  }
  return (
    <polygon
      points={
        `${point.x + halfSize},${point.y} ` +
        `${point.x - halfSize},${point.y - size * 0.42} ` +
        `${point.x - halfSize},${point.y + size * 0.42}`
      }
      fill={color}
      pointerEvents="none"
      transform={`rotate(${angle} ${point.x} ${point.y})`}
    />
  );
}
