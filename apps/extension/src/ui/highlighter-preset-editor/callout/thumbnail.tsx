import { useId, type ReactNode } from 'react';
import type {
  CalloutPreset,
  CalloutConnectorMarker,
  CalloutVisualStyle,
} from '@sniptale/runtime-contracts/highlighter/callout';

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

function CalloutPreviewConnector({ style }: { style: CalloutVisualStyle }) {
  const connector = style.connector;
  if (connector.kind === 'none') return null;

  if (connector.kind === 'wedge') {
    return <path d="M 50 19 L 50 28 L 29 35 Z" fill={style.surface.backgroundColor} />;
  }

  const path =
    connector.routing === 'elbow' ? 'M 50 25 L 40 25 L 40 35 L 29 35' : 'M 50 25 L 29 35';
  return (
    <g data-ui="shared.callout-preview.connector">
      <path
        d={path}
        fill="none"
        stroke={connector.color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={Math.min(Math.max(connector.width, 1), 3)}
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

function resolvePreviewFill(backgroundColor: string, checkerPatternId: string): string {
  return backgroundColor === 'transparent' || backgroundColor === '#00000000'
    ? `url(#${checkerPatternId})`
    : backgroundColor;
}

export function CalloutPresetPreview({
  compact = false,
  placement,
  style,
}: {
  compact?: boolean;
  placement?: CalloutPreset['placement'];
  style: CalloutVisualStyle;
}) {
  const id = useId().replaceAll(':', '');
  const checkerPatternId = `callout-checker-${id}`;
  const clipPathId = `callout-surface-${id}`;
  const surface = style.surface;
  const radius = Math.min(Math.max(surface.radius / 3, 1), 9);
  const surfaceFill = resolvePreviewFill(surface.backgroundColor, checkerPatternId);
  const previewBorderWidth = Math.min(surface.borderWidth, 2);
  const hasWedgeOutline = style.connector.kind === 'wedge' && previewBorderWidth > 0;
  const placementPoint = placement ? getPlacementPreviewPoint(placement) : null;
  const wedgeOutlinePath = [
    'M 50 19 L 29 35 L 50 28',
    `L 50 ${33 - radius} Q 50 33 ${50 + radius} 33`,
    `L ${93 - radius} 33 Q 93 33 93 ${33 - radius}`,
    `L 93 ${4 + radius} Q 93 4 ${93 - radius} 4`,
    `L ${50 + radius} 4 Q 50 4 50 ${4 + radius}`,
    'L 50 19 Z',
  ].join(' ');

  return (
    <span
      className={[
        'relative flex flex-shrink-0 items-center justify-center overflow-hidden rounded-[8px]',
        'border border-[color:var(--sniptale-color-border-soft)]',
        'bg-[color:var(--sniptale-color-surface-canvas)]',
        compact ? 'h-11 w-[4.5rem]' : 'h-[3.25rem] w-24',
      ].join(' ')}
      aria-hidden="true"
      data-callout-placement={placement?.anchor}
      data-ui="shared.callout-preview"
    >
      <svg className="h-full w-full" viewBox="0 0 96 52" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern height="4" id={checkerPatternId} patternUnits="userSpaceOnUse" width="4">
            <rect fill="var(--sniptale-color-surface-input, #e2e8f0)" height="4" width="4" />
            <path
              d="M 0 0 H 2 V 2 H 0 Z M 2 2 H 4 V 4 H 2 Z"
              fill="var(--sniptale-color-surface-panel, #fff)"
            />
          </pattern>
          <clipPath id={clipPathId}>
            <rect height="29" rx={radius} width="43" x="50" y="4" />
          </clipPath>
        </defs>
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
        <CalloutPreviewConnector style={style} />
        <g clipPath={`url(#${clipPathId})`} data-ui="shared.callout-preview.surface">
          <rect
            fill={surfaceFill}
            height="29"
            rx={radius}
            stroke={surface.borderColor}
            strokeWidth={hasWedgeOutline ? 0 : previewBorderWidth}
            width="43"
            x="50"
            y="4"
          />
          {style.title.enabled ? (
            <>
              <rect fill={style.title.backgroundColor} height="9" width="43" x="50" y="4" />
              <path
                d="M 56 9 H 73"
                stroke={style.title.textColor}
                strokeLinecap="round"
                strokeWidth="1.6"
              />
            </>
          ) : null}
          <path
            d={
              style.title.enabled
                ? 'M 56 20 H 86 M 56 25 H 78'
                : 'M 56 14 H 86 M 56 20 H 82 M 56 26 H 74'
            }
            stroke={surface.textColor}
            strokeLinecap="round"
            strokeOpacity="0.76"
            strokeWidth="1.5"
          />
        </g>
        {hasWedgeOutline ? (
          <path
            d={wedgeOutlinePath}
            data-ui="shared.callout-preview.outline"
            fill="none"
            stroke={surface.borderColor}
            strokeLinejoin="round"
            strokeWidth={previewBorderWidth}
          />
        ) : null}
      </svg>
    </span>
  );
}
