import { useId, type CSSProperties, type ReactNode } from 'react';
import { getRepresentativeColor } from '@sniptale/foundation/paint';
import type {
  CalloutPreset,
  CalloutConnectorMarker,
  CalloutVisualStyle,
} from '@sniptale/runtime-contracts/highlighter/callout';
import { getCalloutStrokeDasharray } from '../../../features/highlighter/callout-stroke';
import { getCalloutAccentEdgePath } from '../../../features/highlighter/callout-accent-edge';
import { cloneCalloutVisualStyle } from '../../../features/highlighter/callout-presets/catalog';
import {
  projectCalloutLineCustomCss,
  resolveCalloutCustomCss,
  type ResolvedCalloutCustomCss,
} from '../../../features/highlighter/callout-custom-css';
import { projectCalloutCardStyle } from '../../../features/highlighter/surface-style/card-projection';

const TARGET_COLOR = 'var(--sniptale-color-text-tertiary, #94a3b8)';

function getPlacementPreviewPoint(placement: CalloutPreset['placement']) {
  const x = placement.anchor.endsWith('left') ? 3 : placement.anchor.endsWith('right') ? 30 : 16.5;
  const y = placement.anchor.startsWith('top')
    ? 29
    : placement.anchor.startsWith('bottom')
      ? 45
      : 37;
  return { x, y };
}

function CalloutEndpointMarker(props: {
  color: string;
  marker: CalloutConnectorMarker;
  size: number;
  x: number;
  y: number;
}): ReactNode {
  const size = Math.min(Math.max(props.size * 0.46, 3.5), 9);
  const halfSize = size / 2;
  switch (props.marker) {
    case 'circle':
      return <circle cx={props.x} cy={props.y} fill={props.color} r={halfSize} />;
    case 'ring-dot': {
      const ringStrokeWidth = Number(Math.max(0.8, size * 0.12).toFixed(2));
      const dotRadius = Number(Math.max(0.8, size * 0.14).toFixed(2));
      return (
        <g>
          <circle
            cx={props.x}
            cy={props.y}
            fill="none"
            r={halfSize}
            stroke={props.color}
            strokeWidth={ringStrokeWidth}
          />
          <circle cx={props.x} cy={props.y} fill={props.color} r={dotRadius} />
        </g>
      );
    }
    case 'square':
      return (
        <rect
          fill={props.color}
          height={size}
          width={size}
          x={props.x - halfSize}
          y={props.y - halfSize}
        />
      );
    case 'diamond':
      return (
        <rect
          fill={props.color}
          height={size}
          transform={`rotate(45 ${props.x} ${props.y})`}
          width={size}
          x={props.x - halfSize}
          y={props.y - halfSize}
        />
      );
    case 'arrow': {
      const arrowPath = [
        `M ${props.x - halfSize} ${props.y - size * 0.42}`,
        `L ${props.x + halfSize} ${props.y}`,
        `L ${props.x - halfSize} ${props.y + size * 0.42} Z`,
      ].join(' ');
      return (
        <path d={arrowPath} fill={props.color} transform={`rotate(152 ${props.x} ${props.y})`} />
      );
    }
    case 'none':
      return null;
  }
}

function CalloutPreviewConnector(props: {
  customStyles: ResolvedCalloutCustomCss;
  style: CalloutVisualStyle;
}) {
  const { style } = props;
  const connector = style.connector;
  if (connector.kind === 'none') return null;

  if (connector.kind === 'wedge') {
    return (
      <path
        d="M 50 19 L 50 28 L 29 35 Z"
        data-ui="shared.callout-preview.connector"
        fill={getRepresentativeColor(style.surface.fillPaint)}
        style={props.customStyles.connector}
      />
    );
  }

  const path =
    connector.routing === 'elbow'
      ? connector.cornerStyle.kind === 'rounded'
        ? 'M 50 25 L 42 25 Q 40 25 40 27 L 40 33 Q 40 35 38 35 L 29 35'
        : 'M 50 25 L 40 25 L 40 35 L 29 35'
      : connector.routing === 'polyline'
        ? connector.cornerStyle.kind === 'rounded'
          ? 'M 50 25 L 43 25 Q 41 25 39.5 26.5 L 29 35'
          : 'M 50 25 L 41 25 L 29 35'
        : connector.routing === 'curve'
          ? 'M 50 25 C 43 18 37 42 29 35'
          : 'M 50 25 L 29 35';
  const connectorCustomStyles = projectCalloutLineCustomCss(props.customStyles.connector);
  return (
    <g data-ui="shared.callout-preview.connector" style={connectorCustomStyles.group}>
      <path
        data-ui="shared.callout-preview.connector-line"
        d={path}
        fill="none"
        stroke={connector.color}
        strokeDasharray={getCalloutStrokeDasharray(
          connector.lineStyle,
          Math.min(Math.max(connector.width, 1), 3)
        )}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={Math.min(Math.max(connector.width, 1), 3)}
        style={connectorCustomStyles.line}
      />
      <CalloutEndpointMarker
        color={connector.color}
        marker={connector.blockMarker}
        size={connector.blockMarkerSize}
        x={50}
        y={25}
      />
      <CalloutEndpointMarker
        color={connector.color}
        marker={connector.frameMarker}
        size={connector.frameMarkerSize}
        x={29}
        y={35}
      />
    </g>
  );
}

function getWedgeOutlinePath(radius: number) {
  return [
    'M 50 19 L 29 35 L 50 28',
    `L 50 ${33 - radius} Q 50 33 ${50 + radius} 33`,
    `L ${93 - radius} 33 Q 93 33 93 ${33 - radius}`,
    `L 93 ${4 + radius} Q 93 4 ${93 - radius} 4`,
    `L ${50 + radius} 4 Q 50 4 50 ${4 + radius}`,
    'L 50 19 Z',
  ].join(' ');
}

function CalloutPreviewAccent(props: {
  clipPathId: string;
  customStyles: ResolvedCalloutCustomCss;
  radius: number;
  style: CalloutVisualStyle;
}) {
  const { radius, style } = props;
  if (!style.accentEdge.enabled) return null;
  const accentWidth = Math.min(Math.max(style.accentEdge.width / 2, 1), 3);
  return (
    <>
      <defs>
        <clipPath id={props.clipPathId} clipPathUnits="userSpaceOnUse">
          <rect height="29" rx={radius} width="43" x="50" y="4" />
        </clipPath>
      </defs>
      <path
        clipPath={`url(#${props.clipPathId})`}
        d={getCalloutAccentEdgePath({
          rect: { x: 50, y: 4, width: 43, height: 29 },
          side: style.accentEdge.side,
        })}
        data-ui="shared.callout-preview.accent-edge"
        fill="none"
        stroke={style.accentEdge.color}
        strokeDasharray={getCalloutStrokeDasharray(style.accentEdge.lineStyle, accentWidth)}
        strokeLinecap={style.accentEdge.lineStyle === 'dotted' ? 'round' : 'butt'}
        strokeLinejoin="round"
        strokeWidth={accentWidth * 2}
        style={props.customStyles.accent}
      />
    </>
  );
}

function CalloutPreviewCard(props: {
  clipPathId: string;
  customStyles: ResolvedCalloutCustomCss;
  style: CalloutVisualStyle;
}) {
  const { style } = props;
  const surface = style.surface;
  const radius = Math.min(Math.max(surface.radius / 3, 1), 9);
  const previewBorderWidth = Math.min(surface.borderWidth, 2);
  const hasWedgeOutline = style.connector.kind === 'wedge' && previewBorderWidth > 0;
  const badge = style.badge;
  const badgeSize = Math.min(7, Math.max(4, badge.size * 0.28));
  const cardStyle = projectCalloutCardStyle(style);
  return (
    <>
      <foreignObject
        height="29"
        width="43"
        x="50"
        y="4"
        data-ui="shared.callout-preview.surface-html"
      >
        <div
          style={
            {
              ...cardStyle,
              borderRadius: radius,
              borderWidth: hasWedgeOutline ? 0 : previewBorderWidth,
              boxSizing: 'border-box',
              height: '29px',
              overflow: 'hidden',
              padding: '4px 6px',
              width: '43px',
            } as CSSProperties
          }
        >
          {style.title.enabled ? (
            <div
              style={{
                background: style.title.backgroundColor,
                borderBottom: [
                  `${Math.min(style.title.dividerWidth, 2)}px`,
                  style.title.dividerStyle,
                  style.title.dividerColor,
                ].join(' '),
                color: style.title.textColor,
                fontSize: 4,
                lineHeight: '7px',
                ...props.customStyles.title,
              }}
            >
              <span
                aria-hidden="true"
                style={{ background: 'currentColor', display: 'block', height: 2, width: '65%' }}
              />
            </div>
          ) : null}
          {badge.enabled ? (
            <span
              data-ui="shared.callout-preview.badge"
              style={{
                background: badge.backgroundColor,
                border: `${Math.min(1.5, badge.borderWidth * 0.35)}px solid ${badge.borderColor}`,
                borderRadius:
                  badge.shape === 'square' ? 0 : badge.shape === 'circle' ? badgeSize / 2 : 2,
                display: 'inline-block',
                height: badgeSize,
                width: Math.max(badgeSize, Math.min(14, badge.text.length * 3.2 + 3)),
              }}
            />
          ) : null}
          <div
            style={{
              color: surface.textColor,
              fontSize: 4,
              lineHeight: '5px',
              opacity: 0.76,
              ...props.customStyles.body,
            }}
          >
            <span
              aria-hidden="true"
              style={{ background: 'currentColor', display: 'block', height: 1, width: '88%' }}
            />
            <span
              aria-hidden="true"
              style={{
                background: 'currentColor',
                display: 'block',
                height: 1,
                marginTop: 2,
                width: '58%',
              }}
            />
          </div>
        </div>
      </foreignObject>
      {hasWedgeOutline ? (
        <path
          d={getWedgeOutlinePath(radius)}
          data-ui="shared.callout-preview.outline"
          fill="none"
          stroke={surface.borderColor}
          strokeDasharray={getCalloutStrokeDasharray(surface.borderStyle, previewBorderWidth)}
          strokeLinejoin="round"
          strokeWidth={previewBorderWidth}
        />
      ) : null}
      <CalloutPreviewAccent
        clipPathId={`${props.clipPathId}-accent`}
        customStyles={props.customStyles}
        radius={radius}
        style={style}
      />
    </>
  );
}

export function CalloutPresetPreview({
  compact = false,
  editor = false,
  placement,
  style,
}: {
  compact?: boolean;
  editor?: boolean;
  placement?: CalloutPreset['placement'];
  style: CalloutVisualStyle;
}) {
  const id = useId().replaceAll(':', '');
  const clipPathId = `callout-surface-${id}`;
  const normalizedStyle = cloneCalloutVisualStyle(style);
  const customStyles = resolveCalloutCustomCss(normalizedStyle.customCss).styles;
  const placementPoint = placement ? getPlacementPreviewPoint(placement) : null;

  return (
    <span
      className={[
        'relative flex flex-shrink-0 items-center justify-center overflow-hidden rounded-[8px]',
        'border border-[color:var(--sniptale-color-border-soft)]',
        'bg-[color:var(--sniptale-color-surface-canvas)]',
        editor ? 'h-[4.875rem] w-36' : compact ? 'h-9 w-16' : 'h-[3.25rem] w-24',
      ].join(' ')}
      aria-hidden="true"
      data-callout-placement={placement?.anchor}
      data-ui="shared.callout-preview"
    >
      <svg className="h-full w-full" viewBox="0 0 96 52" xmlns="http://www.w3.org/2000/svg">
        <rect
          data-ui="shared.callout-preview.target"
          fill="none"
          height="16"
          rx="3"
          stroke={TARGET_COLOR}
          strokeDasharray="2 2"
          strokeOpacity="0.72"
          width="27"
          x="3"
          y="29"
        />
        <path
          d="M 8 34 H 23 M 8 39 H 18"
          stroke={TARGET_COLOR}
          strokeLinecap="round"
          strokeOpacity="0.48"
        />
        {placementPoint ? (
          <circle
            cx={placementPoint.x}
            cy={placementPoint.y}
            fill="var(--sniptale-color-accent, #f97316)"
            r="2"
          />
        ) : null}
        <CalloutPreviewConnector customStyles={customStyles} style={normalizedStyle} />
        <CalloutPreviewCard
          clipPathId={clipPathId}
          customStyles={customStyles}
          style={normalizedStyle}
        />
      </svg>
    </span>
  );
}
