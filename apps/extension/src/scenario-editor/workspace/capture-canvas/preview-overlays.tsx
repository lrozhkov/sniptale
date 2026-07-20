import { memo, type ReactNode } from 'react';
import { shouldRenderScenarioArrowHead } from '../../project/stage-render/arrow-head';
import {
  SCENARIO_CLICK_RING_FILL,
  SCENARIO_CLICK_RING_RADIUS,
  SCENARIO_CLICK_RING_STROKE,
  SCENARIO_CLICK_RING_STROKE_WIDTH,
  SCENARIO_FOCUS_RECT_RADIUS,
} from '../../../features/scenario/capture-step/annotation-styles';
import type { ScenarioAnnotationRenderMode } from '@sniptale/runtime-contracts/scenario/types/base';
import type { ScenarioOverlay } from '../../../features/scenario/contracts/types/overlays';
import type { ScenarioStageLayout } from '../../../features/scenario/stage/layout';
import { projectPoint, projectRect } from '../../project/stage-render/svg-overlays.helpers';
import { BlurRectOverlay } from './preview-overlays.blur';

function getOverlayStroke(overlay: ScenarioOverlay): string {
  switch (overlay.kind) {
    case 'focus-rect':
      return '#f97316';
    case 'click-ring':
      return SCENARIO_CLICK_RING_STROKE;
    case 'cursor':
      return '#111827';
    case 'arrow':
      return overlay.color;
    case 'rectangle':
    case 'ellipse':
      return overlay.strokeColor;
    case 'text':
      return overlay.color;
    case 'blur-rect':
      return '#475569';
  }
}

function FocusRectOverlay(props: {
  layout: ScenarioStageLayout;
  overlay: Extract<ScenarioOverlay, { kind: 'focus-rect' }>;
}) {
  const rect = projectRect(props.layout, props.overlay.rect);

  return (
    <rect
      x={rect.x}
      y={rect.y}
      width={rect.width}
      height={rect.height}
      fill="none"
      stroke={getOverlayStroke(props.overlay)}
      strokeWidth={3}
      rx={SCENARIO_FOCUS_RECT_RADIUS}
      ry={SCENARIO_FOCUS_RECT_RADIUS}
    />
  );
}

function PointOverlay(props: {
  layout: ScenarioStageLayout;
  overlay: Extract<ScenarioOverlay, { kind: 'click-ring' | 'cursor' }>;
}) {
  const point = projectPoint(props.layout, props.overlay.point);
  if (props.overlay.kind === 'click-ring') {
    const scale = props.layout.imageRect.width / props.layout.sourceViewport.width;
    const radius = SCENARIO_CLICK_RING_RADIUS * scale;

    return (
      <ellipse
        cx={point.x}
        cy={point.y}
        rx={radius}
        ry={radius}
        fill={SCENARIO_CLICK_RING_FILL}
        stroke={getOverlayStroke(props.overlay)}
        strokeWidth={SCENARIO_CLICK_RING_STROKE_WIDTH * scale}
      />
    );
  }

  return (
    <circle cx={point.x} cy={point.y} r={10} fill="#111827" stroke="#111827" strokeWidth={2} />
  );
}

function ArrowOverlay(props: {
  layout: ScenarioStageLayout;
  markerId: string;
  overlay: Extract<ScenarioOverlay, { kind: 'arrow' }>;
}) {
  const start = projectPoint(props.layout, props.overlay.start);
  const end = projectPoint(props.layout, props.overlay.end);
  const markerEnd = shouldRenderScenarioArrowHead(start, end)
    ? `url(#${props.markerId})`
    : undefined;

  return (
    <line
      x1={start.x}
      y1={start.y}
      x2={end.x}
      y2={end.y}
      stroke={getOverlayStroke(props.overlay)}
      strokeWidth={props.overlay.strokeWidth}
      strokeLinecap="round"
      markerEnd={markerEnd}
    />
  );
}

function RectangleOverlay(props: {
  layout: ScenarioStageLayout;
  overlay: Extract<ScenarioOverlay, { kind: 'rectangle' }>;
}) {
  const rect = projectRect(props.layout, props.overlay.rect);

  return (
    <rect
      x={rect.x}
      y={rect.y}
      width={rect.width}
      height={rect.height}
      fill={props.overlay.fillColor}
      stroke={getOverlayStroke(props.overlay)}
      strokeWidth={props.overlay.strokeWidth}
      rx={10}
      ry={10}
    />
  );
}

function EllipseOverlay(props: {
  layout: ScenarioStageLayout;
  overlay: Extract<ScenarioOverlay, { kind: 'ellipse' }>;
}) {
  const rect = projectRect(props.layout, props.overlay.rect);

  return (
    <ellipse
      cx={rect.x + rect.width / 2}
      cy={rect.y + rect.height / 2}
      rx={rect.width / 2}
      ry={rect.height / 2}
      fill={props.overlay.fillColor}
      stroke={getOverlayStroke(props.overlay)}
      strokeWidth={props.overlay.strokeWidth}
    />
  );
}

function TextOverlay(props: {
  layout: ScenarioStageLayout;
  overlay: Extract<ScenarioOverlay, { kind: 'text' }>;
}) {
  const point = projectPoint(props.layout, props.overlay.point);

  return (
    <text
      x={point.x}
      y={point.y}
      fill={getOverlayStroke(props.overlay)}
      fontSize={props.overlay.fontSize}
      fontFamily={props.overlay.fontFamily}
      fontWeight={props.overlay.fontWeight}
      dominantBaseline="hanging"
    >
      {props.overlay.text}
    </text>
  );
}

function renderOverlay(props: {
  assetDataUrl: string;
  layout: ScenarioStageLayout;
  markerId: string;
  overlay: ScenarioOverlay;
  overlayIdPrefix: string;
}): ReactNode {
  switch (props.overlay.kind) {
    case 'focus-rect':
      return <FocusRectOverlay layout={props.layout} overlay={props.overlay} />;
    case 'click-ring':
    case 'cursor':
      return <PointOverlay layout={props.layout} overlay={props.overlay} />;
    case 'arrow':
      return (
        <ArrowOverlay layout={props.layout} markerId={props.markerId} overlay={props.overlay} />
      );
    case 'rectangle':
      return <RectangleOverlay layout={props.layout} overlay={props.overlay} />;
    case 'ellipse':
      return <EllipseOverlay layout={props.layout} overlay={props.overlay} />;
    case 'text':
      return <TextOverlay layout={props.layout} overlay={props.overlay} />;
    case 'blur-rect':
      return (
        <BlurRectOverlay
          assetDataUrl={props.assetDataUrl}
          imageRect={props.layout.imageRect}
          layout={props.layout}
          overlay={props.overlay}
          overlayIdPrefix={props.overlayIdPrefix}
        />
      );
  }
}

function WorkspacePreviewOverlaysInner(props: {
  annotationRenderMode?: ScenarioAnnotationRenderMode;
  assetDataUrl: string;
  layout: ScenarioStageLayout;
  markerId: string;
  overlays: ScenarioOverlay[];
  stepId: string;
}) {
  if (props.annotationRenderMode === 'asset') {
    return null;
  }

  return props.overlays.map((overlay) => (
    <g key={overlay.id}>
      {renderOverlay({
        assetDataUrl: props.assetDataUrl,
        layout: props.layout,
        markerId: props.markerId,
        overlay,
        overlayIdPrefix: `${props.stepId}-${overlay.id}`,
      })}
    </g>
  ));
}

export const WorkspacePreviewOverlays = memo(WorkspacePreviewOverlaysInner);
