import { createContext, useLayoutEffect, useState, type ReactNode, type RefObject } from 'react';
import { Focus, Move, RotateCcw, RotateCw, Scan } from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { SegmentedRow } from '../../ui/compact-inspector-controls';
import { translate, formatNumber, useAppLocale } from '../../platform/i18n';
import type { QuickEditZoomRegion } from '../../features/video/review/advanced/types';
import type { QuickEditZoomRegionPatch } from '../../features/video/review/advanced/zoom';
import {
  resolveReviewSpatialFocusGeometry,
  type ReviewSpatialControlGeometryInput,
  type ReviewSpatialControlPoint,
} from './spatial-control-geometry';
import { useSpatialGesture, type SpatialTool, type SpatialAxis } from './spatial-gesture';
import './spatial-controls.css';

const toolLabels = {
  position: 'gallery.videoReview.spatialToolPosition',
  tilt: 'gallery.videoReview.spatialToolTilt',
  rotation: 'gallery.videoReview.spatialToolRotation',
  focus: 'gallery.videoReview.spatialToolFocus',
} as const;
const toolIcons = { position: Move, tilt: Scan, rotation: RotateCw, focus: Focus };

/** The inspector owns navigation; its preview and numeric fields share this disposable choice. */
export const ReviewSpatialToolContext = createContext<{
  tool: SpatialTool;
  onTool(tool: SpatialTool): void;
} | null>(null);

/** Navigation stays outside the canvas capture scope and never mutates the selected target. */
export function ReviewSpatialToolbar(props: {
  tool: SpatialTool;
  axis: SpatialAxis;
  disabled: boolean;
  onTool(tool: SpatialTool): void;
  onAxis(axis: SpatialAxis): void;
  onReset(): void;
  children?: ReactNode;
}) {
  return (
    <div className="review-spatial-toolbar" data-ui="gallery.videoReview.spatialTools">
      <div
        className="review-spatial-tools"
        role="group"
        aria-label={translate('gallery.videoReview.spatialTools')}
      >
        {(['position', 'tilt', 'rotation', 'focus'] as const).map((tool) => {
          const Icon = toolIcons[tool];
          return (
            <ContentToolbarButton
              type="button"
              key={tool}
              size="compact"
              tone="utility"
              aria-pressed={props.tool === tool}
              title={translate(toolLabels[tool])}
              disabled={props.disabled}
              onClick={() => props.onTool(tool)}
            >
              <Icon size={15} aria-hidden />
            </ContentToolbarButton>
          );
        })}
        <span className="review-spatial-tool-name">{translate(toolLabels[props.tool])}</span>
        <ContentToolbarButton
          type="button"
          size="compact"
          tone="utility"
          title={translate(
            props.tool === 'position'
              ? 'gallery.videoReview.spatialResetPosition'
              : props.tool === 'tilt'
                ? 'gallery.videoReview.spatialResetTilt'
                : props.tool === 'rotation'
                  ? 'gallery.videoReview.spatialResetRotation'
                  : 'gallery.videoReview.spatialResetFocus'
          )}
          disabled={props.disabled}
          onClick={props.onReset}
        >
          <RotateCcw size={14} aria-hidden />
        </ContentToolbarButton>
      </div>
      <div className="review-spatial-context">
        {props.tool === 'tilt' ? (
          <SegmentedRow<SpatialAxis>
            ariaLabel={translate('gallery.videoReview.spatialAxis')}
            value={props.axis}
            options={[
              {
                value: 'both',
                label: translate('gallery.videoReview.spatialAxisBoth'),
                disabled: props.disabled,
              },
              { value: 'x', label: 'X', disabled: props.disabled },
              { value: 'y', label: 'Y', disabled: props.disabled },
            ]}
            onChange={props.onAxis}
          />
        ) : (
          props.children
        )}
      </div>
    </div>
  );
}

type SpatialControlsProps = {
  region: QuickEditZoomRegion;
  renderedRegion: QuickEditZoomRegion;
  revision: string;
  tool: SpatialTool;
  axis: SpatialAxis;
  geometry: ReviewSpatialControlGeometryInput | null;
  output: { width: number; height: number };
  bounds: RefObject<HTMLDivElement | null>;
  enabled: boolean;
  onPreview(patch: QuickEditZoomRegionPatch | null): void;
  onCommit(revision: string, patch: QuickEditZoomRegionPatch): void;
  onInteract(): void;
};
type FocusGeometry = ReturnType<typeof resolveReviewSpatialFocusGeometry>;
type Gesture = ReturnType<typeof useSpatialGesture>;
type Output = SpatialControlsProps['output'];

function pointPosition(point: ReviewSpatialControlPoint, output: Output) {
  return {
    left: `${(point.x / output.width) * 100}%`,
    top: `${(point.y / output.height) * 100}%`,
  };
}

function visiblePoint(point: ReviewSpatialControlPoint, output: Output) {
  return point.x >= 0 && point.x <= output.width && point.y >= 0 && point.y <= output.height;
}

/** Owns CSS measurement so the complete roll hit target stays inside the preview. */
function useRollRadius(bounds: SpatialControlsProps['bounds'], output: Output) {
  const { width, height } = output;
  const [cssWidth, setCssWidth] = useState(width);
  useLayoutEffect(() => {
    const node = bounds.current;
    if (!node) return;
    const measure = () => {
      const measured = node.getBoundingClientRect().width;
      if (measured > 0) setCssWidth(measured);
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(node);
    return () => observer?.disconnect();
  }, [bounds]);
  return Math.max(
    0,
    Math.min(Math.min(width, height) * 0.36, Math.min(width, height) / 2 - (16 * width) / cssWidth)
  );
}

function SpatialGuides({
  output,
  tool,
  radius,
  focus,
}: {
  output: Output;
  tool: SpatialTool;
  radius: number;
  focus: FocusGeometry;
}) {
  const paths = (contours: ReviewSpatialControlPoint[][]) =>
    contours.map((points, index) => (
      <polyline key={index} points={points.map((p) => `${p.x},${p.y}`).join(' ')} />
    ));
  return (
    <svg
      viewBox={`0 0 ${output.width} ${output.height}`}
      aria-hidden
      className="review-spatial-guides"
    >
      {tool === 'rotation' ? (
        <circle cx={output.width / 2} cy={output.height / 2} r={radius} />
      ) : null}
      {focus ? (
        <>
          <g>{paths(focus.sharp)}</g>
          <g className="review-spatial-soft-guide">{paths(focus.soft)}</g>
        </>
      ) : null}
    </svg>
  );
}

function SpatialRotationHandles({
  tool,
  output,
  radius,
  roll,
  bind,
}: {
  tool: SpatialTool;
  output: Output;
  radius: number;
  roll: number;
  bind: Gesture['bind'];
}) {
  if (tool === 'tilt')
    return (
      <button
        type="button"
        {...bind('tilt')}
        data-spatial-handle="tilt"
        className="review-spatial-tilt"
        aria-label={translate('gallery.videoReview.spatialDragTilt')}
        title={translate('gallery.videoReview.spatialDragTilt')}
      >
        <Scan size={20} aria-hidden />
      </button>
    );
  if (tool !== 'rotation') return null;
  const angle = ((roll - 90) * Math.PI) / 180;
  const point = {
    x: output.width / 2 + radius * Math.cos(angle),
    y: output.height / 2 + radius * Math.sin(angle),
  };
  return (
    <button
      type="button"
      {...bind('rotation')}
      data-spatial-handle="rotation"
      className="review-spatial-handle"
      style={pointPosition(point, output)}
      aria-label={translate('gallery.videoReview.spatialDragRotation')}
      title={translate('gallery.videoReview.spatialDragRotation')}
    >
      <RotateCw size={14} aria-hidden />
    </button>
  );
}

function SpatialFocusHandles({
  focus,
  output,
  bind,
}: {
  focus: FocusGeometry;
  output: Output;
  bind: Gesture['bind'];
}) {
  if (!focus) return null;
  return (
    <>
      {visiblePoint(focus.center, output) ? (
        <button
          type="button"
          {...bind('center')}
          data-spatial-handle="center"
          className="review-spatial-handle"
          style={pointPosition(focus.center, output)}
          aria-label={translate('gallery.videoReview.spatialFocusCenter')}
          title={translate('gallery.videoReview.spatialFocusCenter')}
        >
          <Focus size={14} aria-hidden />
        </button>
      ) : null}
      {focus.handles
        .filter((handle) => visiblePoint(handle.point, output))
        .map((handle) => {
          const label = translate(
            handle.kind === 'width'
              ? 'gallery.videoReview.depthWidth'
              : 'gallery.videoReview.depthSoftness'
          );
          return (
            <button
              key={`${handle.kind}-${handle.side}`}
              type="button"
              {...bind(handle.kind, handle.side)}
              data-spatial-handle={handle.kind}
              className="review-spatial-handle review-spatial-boundary-handle"
              style={pointPosition(handle.point, output)}
              aria-label={label}
              title={label}
            >
              <span />
            </button>
          );
        })}
    </>
  );
}

function SpatialControlStatus({
  flat,
  active,
  tool,
  region,
}: {
  flat: boolean;
  active: Gesture['active'];
  tool: SpatialTool;
  region: QuickEditZoomRegion;
}) {
  const locale = useAppLocale();
  const angleLabel = (value: number) =>
    formatNumber(value, { minimumFractionDigits: 1, maximumFractionDigits: 1 }, locale);
  if (flat)
    return (
      <span className="review-spatial-status">
        {translate('gallery.videoReview.spatialFlatDepth')}
      </span>
    );
  if (!active || tool === 'focus') return null;
  const perspective = region.perspective;
  const label =
    tool === 'rotation'
      ? `${angleLabel(perspective?.rotateZ ?? 0)}°`
      : `X ${angleLabel(perspective?.rotateX ?? 0)}° · Y ${angleLabel(perspective?.rotateY ?? 0)}°`;
  return <span className="review-spatial-status">{label}</span>;
}

/** UI contours share the renderer's plane; the gesture hook retains sole transaction authority. */
export function ReviewSpatialControls(props: SpatialControlsProps) {
  const gesture = useSpatialGesture(props);
  const radius = useRollRadius(props.bounds, props.output);
  const focus =
    props.tool === 'focus' && props.geometry
      ? resolveReviewSpatialFocusGeometry(props.geometry)
      : null;
  return (
    <div
      className="review-spatial-controls"
      data-tool={props.tool}
      data-active={gesture.active ?? undefined}
      data-ui="gallery.videoReview.spatialControls"
    >
      <SpatialGuides output={props.output} tool={props.tool} radius={radius} focus={focus} />
      <SpatialRotationHandles
        tool={props.tool}
        output={props.output}
        radius={radius}
        roll={props.renderedRegion.perspective?.rotateZ ?? 0}
        bind={gesture.bind}
      />
      <SpatialFocusHandles focus={focus} output={props.output} bind={gesture.bind} />
      <SpatialControlStatus
        flat={focus?.flat ?? false}
        active={gesture.active}
        tool={props.tool}
        region={props.renderedRegion}
      />
    </div>
  );
}
