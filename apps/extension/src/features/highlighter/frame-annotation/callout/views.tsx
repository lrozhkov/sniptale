import React from 'react';
import { createPortal } from 'react-dom';
import { translate } from '../../../../platform/i18n';
import type { AppTheme } from '@sniptale/ui/theme/types';
import { mergeThemeScopedStyle } from '@sniptale/ui/theme/safe-portal';
import { ProductGlassToolbar, ProductGlassToolbarButton } from '@sniptale/ui/product-glass-toolbar';
import { getRepresentativeColor, serializePaintToCss } from '@sniptale/foundation/paint';
import type { getDynamicTailState } from './dynamic-tail';
import type { getLineConnectorState } from './line-connector';
import type {
  CalloutConnectorMarker,
  CalloutVisualStyle,
} from '@sniptale/runtime-contracts/highlighter/callout';
import { getCalloutStrokeDasharray } from '../../callout-stroke';
import { getCalloutAccentEdgePath } from '../../callout-accent-edge';
import {
  projectCalloutLineCustomCss,
  type ResolvedCalloutCustomCss,
} from '../../callout-custom-css';

type CalloutConnectorState =
  | ReturnType<typeof getDynamicTailState>
  | ReturnType<typeof getLineConnectorState>;

function getCalloutToolbarWrapperStyle(
  rect: DOMRect,
  zIndex: number,
  visualScale: number
): React.CSSProperties {
  return {
    position: 'fixed',
    top: rect.top - 46 * visualScale,
    left: rect.left + rect.width / 2 - 62 * visualScale,
    zIndex,
  };
}

export function renderCalloutFloatingToolbar(props: {
  applyFormatting: (command: string, event: React.MouseEvent) => void;
  effectiveZIndex: number;
  floatingToolbarRect: DOMRect | null;
  isEditing: boolean;
  portalTheme: AppTheme | null;
  portalTarget: Element | DocumentFragment;
  visualScale?: number;
}) {
  if (!props.floatingToolbarRect || !props.isEditing) {
    return null;
  }

  return createPortal(
    <div
      data-theme={props.portalTheme ?? undefined}
      style={mergeThemeScopedStyle(
        props.portalTheme,
        getCalloutToolbarWrapperStyle(
          props.floatingToolbarRect,
          props.effectiveZIndex,
          props.visualScale ?? 1
        )
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
    props.portalTarget
  );
}

export function renderDynamicCalloutTail(
  tail: CalloutConnectorState | null,
  style: CalloutVisualStyle,
  customStyles?: ResolvedCalloutCustomCss,
  visualScale = 1
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
          strokeWidth={18 * visualScale}
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
            strokeWidth={style.connector.width * visualScale}
            style={connectorCustomStyles.line}
          />
          {renderConnectorMarker(
            style.connector.blockMarker,
            tail.blockPoint,
            style.connector.color,
            tail.blockAngle,
            style.connector.blockMarkerSize * visualScale
          )}
          {renderConnectorMarker(
            style.connector.frameMarker,
            tail.framePoint,
            style.connector.color,
            tail.frameAngle,
            style.connector.frameMarkerSize * visualScale
          )}
        </g>
      </svg>
    );
  }
  return (
    <DynamicWedgeSurface
      {...(customStyles === undefined ? {} : { customStyles })}
      style={style}
      tail={tail}
      visualScale={visualScale}
    />
  );
}

function DynamicWedgeSurface(props: {
  customStyles?: ResolvedCalloutCustomCss;
  style: CalloutVisualStyle;
  tail: ReturnType<typeof getDynamicTailState>;
  visualScale: number;
}) {
  const useHtmlSurface = shouldUseHtmlWedgeSurface(props);
  return (
    <>
      {useHtmlSurface ? (
        <div
          aria-hidden="true"
          data-ui="content.callout.unified-surface"
          style={projectUnifiedWedgeSurfaceStyle(props)}
        />
      ) : null}
      <svg
        className="sniptale-callout-dynamic-tail"
        aria-hidden="true"
        focusable="false"
        preserveAspectRatio="xMinYMin meet"
        style={props.tail.style}
        viewBox={props.tail.viewBox}
      >
        <path
          d={props.tail.path}
          fill="none"
          pointerEvents="stroke"
          stroke="transparent"
          strokeWidth={18 * props.visualScale}
        />
        <path
          data-ui="content.callout.tail-outline"
          d={props.tail.outlinePath}
          fill={useHtmlSurface ? 'none' : getRepresentativeColor(props.style.surface.fillPaint)}
          pointerEvents="none"
          stroke={props.style.surface.borderWidth > 0 ? props.style.surface.borderColor : 'none'}
          strokeDasharray={getCalloutStrokeDasharray(
            props.style.surface.borderStyle,
            props.style.surface.borderWidth
          )}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={props.style.surface.borderWidth * props.visualScale}
          style={props.customStyles?.connector}
        />
      </svg>
    </>
  );
}

function shouldUseHtmlWedgeSurface(props: Parameters<typeof DynamicWedgeSurface>[0]): boolean {
  return (
    props.style.surface.fillPaint.kind !== 'solid' ||
    Object.keys(props.customStyles?.card ?? {}).length > 0
  );
}

function projectUnifiedWedgeSurfaceStyle(
  props: Parameters<typeof DynamicWedgeSurface>[0]
): React.CSSProperties {
  const cardStyles = props.customStyles?.card ?? {};
  return {
    ...props.tail.style,
    background: cardStyles.background ?? serializePaintToCss(props.style.surface.fillPaint),
    backgroundColor: cardStyles.backgroundColor,
    backgroundImage: cardStyles.backgroundImage,
    backgroundPosition: cardStyles.backgroundPosition,
    backgroundRepeat: cardStyles.backgroundRepeat,
    backgroundSize: cardStyles.backgroundSize,
    backdropFilter: cardStyles.backdropFilter,
    boxShadow: cardStyles.boxShadow,
    clipPath: `path("${props.tail.outlinePath}")`,
    pointerEvents: 'none',
  };
}

export function renderCalloutAccentEdge(
  style: CalloutVisualStyle,
  dimensions: { width: number; height: number },
  customStyles?: ResolvedCalloutCustomCss,
  visualScale = 1
) {
  return (
    <CalloutAccentEdgeView
      customStyles={customStyles}
      dimensions={dimensions}
      style={style}
      visualScale={visualScale}
    />
  );
}

function CalloutAccentEdgeView(props: {
  customStyles: ResolvedCalloutCustomCss | undefined;
  dimensions: { width: number; height: number };
  style: CalloutVisualStyle;
  visualScale: number;
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
          <rect
            height={dimensions.height}
            rx={style.surface.radius * props.visualScale}
            width={dimensions.width}
          />
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
        strokeWidth={accent.width * 2 * props.visualScale}
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
