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
  style: CalloutVisualStyle
) {
  if (!tail) return null;
  if (tail.kind === 'line') {
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
        <path
          d={tail.path}
          fill="none"
          pointerEvents="none"
          stroke={style.connector.color}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={style.connector.width}
        />
        {renderConnectorMarker(
          style.connector.blockMarker,
          tail.blockPoint,
          style.connector.color,
          tail.blockAngle
        )}
        {renderConnectorMarker(
          style.connector.frameMarker,
          tail.framePoint,
          style.connector.color,
          tail.frameAngle
        )}
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
      <path d={tail.path} fill={style.surface.backgroundColor} pointerEvents="none" />
    </svg>
  );
}

function renderConnectorMarker(
  marker: CalloutConnectorMarker,
  point: { x: number; y: number },
  color: string,
  angle: number
) {
  if (marker === 'none') return null;
  if (marker === 'circle') {
    return <circle cx={point.x} cy={point.y} r={5} fill={color} pointerEvents="none" />;
  }
  if (marker === 'square') {
    return <rect x={point.x - 5} y={point.y - 5} width={10} height={10} fill={color} />;
  }
  if (marker === 'diamond') {
    return (
      <polygon
        points={
          `${point.x},${point.y - 6} ${point.x + 6},${point.y} ` +
          `${point.x},${point.y + 6} ${point.x - 6},${point.y}`
        }
        fill={color}
      />
    );
  }
  return (
    <polygon
      points={
        `${point.x + 7},${point.y} ${point.x - 6},${point.y - 6} ` + `${point.x - 6},${point.y + 6}`
      }
      fill={color}
      transform={`rotate(${angle} ${point.x} ${point.y})`}
    />
  );
}
