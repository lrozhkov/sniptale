import { memo, useMemo } from 'react';
import { SCENARIO_ARROW_HEAD_MARKER } from '../../project/stage-render/arrow-head';
import {
  SCENARIO_STAGE_HEIGHT,
  SCENARIO_STAGE_WIDTH,
} from '../../../features/scenario/stage/layout';
import type { ScenarioStageLayout } from '../../../features/scenario/stage/layout';
import { resolveScenarioStageLayout } from '../../../features/scenario/stage/layout';
import type { ScenarioCaptureStep } from '../../../features/scenario/contracts/types/project';
import type { WorkspacePreviewAssetState } from './preview-asset';
import { WorkspacePreviewOverlays } from './preview-overlays';

const FALLBACK_BACKGROUND_COLOR = '#f3ede2';

function createWorkspacePreviewStaticLayout(args: {
  assetDimensions: { width: number; height: number };
  pageViewport: ScenarioCaptureStep['page']['viewport'];
  scale: number;
  viewportTransform: ScenarioCaptureStep['viewportTransform'];
}) {
  return resolveScenarioStageLayout(
    {
      page: {
        viewport: args.pageViewport,
      },
      imageTransform: {
        scale: args.scale,
        x: 0,
        y: 0,
      },
      viewportTransform: args.viewportTransform,
    } as ScenarioCaptureStep,
    args.assetDimensions
  );
}

const WorkspacePreviewStaticContent = memo(function WorkspacePreviewStaticContent(props: {
  annotationRenderMode?: ScenarioCaptureStep['annotationRenderMode'];
  assetDataUrl: string | null;
  layout: ScenarioStageLayout | null;
  markerId: string;
  overlays: ScenarioCaptureStep['overlays'];
  stepId: string;
}) {
  if (!props.layout || !props.assetDataUrl) {
    return null;
  }

  return (
    <>
      <image
        href={props.assetDataUrl}
        x={props.layout.imageRect.x}
        y={props.layout.imageRect.y}
        width={props.layout.imageRect.width}
        height={props.layout.imageRect.height}
        preserveAspectRatio="none"
      />
      <WorkspacePreviewOverlays
        {...(props.annotationRenderMode === undefined
          ? {}
          : { annotationRenderMode: props.annotationRenderMode })}
        assetDataUrl={props.assetDataUrl}
        layout={props.layout}
        markerId={props.markerId}
        overlays={props.overlays}
        stepId={props.stepId}
      />
    </>
  );
});

function useWorkspacePreviewLayout(props: {
  assetDimensions: WorkspacePreviewAssetState['dimensions'];
  step: ScenarioCaptureStep;
}) {
  return useMemo(
    () =>
      props.assetDimensions
        ? createWorkspacePreviewStaticLayout({
            assetDimensions: props.assetDimensions,
            pageViewport: props.step.page.viewport,
            scale: props.step.imageTransform.scale,
            viewportTransform: props.step.viewportTransform,
          })
        : null,
    [
      props.assetDimensions,
      props.step.imageTransform.scale,
      props.step.page.viewport,
      props.step.viewportTransform,
    ]
  );
}

const WorkspacePreviewDefs = memo(function WorkspacePreviewDefs(props: {
  layout: ScenarioStageLayout | null;
  markerId: string;
  viewportClipId: string;
}) {
  return (
    <defs>
      {props.layout ? (
        <clipPath id={props.viewportClipId}>
          <rect
            x={props.layout.viewport.x}
            y={props.layout.viewport.y}
            width={props.layout.viewport.width}
            height={props.layout.viewport.height}
            rx={18}
            ry={18}
          />
        </clipPath>
      ) : null}
      <marker
        id={props.markerId}
        markerWidth={SCENARIO_ARROW_HEAD_MARKER.width}
        markerHeight={SCENARIO_ARROW_HEAD_MARKER.height}
        refX={SCENARIO_ARROW_HEAD_MARKER.refX}
        refY={SCENARIO_ARROW_HEAD_MARKER.refY}
        orient="auto"
      >
        <path d={SCENARIO_ARROW_HEAD_MARKER.path} fill={SCENARIO_ARROW_HEAD_MARKER.fill} />
      </marker>
    </defs>
  );
});

const WorkspacePreviewViewport = memo(function WorkspacePreviewViewport(props: {
  assetDataUrl: string | null;
  layout: ScenarioStageLayout | null;
  markerId: string;
  step: ScenarioCaptureStep;
  viewportClipId: string;
}) {
  if (!props.layout) {
    return null;
  }

  return (
    <>
      <rect
        x={props.layout.viewport.x}
        y={props.layout.viewport.y}
        width={props.layout.viewport.width}
        height={props.layout.viewport.height}
        rx={18}
        ry={18}
        fill="rgba(255,255,255,0.65)"
        stroke="rgba(120,113,108,0.22)"
        strokeWidth={1.5}
      />
      <g clipPath={`url(#${props.viewportClipId})`}>
        <g transform={`translate(${props.step.imageTransform.x} ${props.step.imageTransform.y})`}>
          <WorkspacePreviewStaticContent
            {...(props.step.annotationRenderMode === undefined
              ? {}
              : { annotationRenderMode: props.step.annotationRenderMode })}
            assetDataUrl={props.assetDataUrl}
            layout={props.layout}
            markerId={props.markerId}
            overlays={props.step.overlays}
            stepId={props.step.id}
          />
        </g>
      </g>
    </>
  );
});

export function WorkspacePreviewSvg(props: {
  assetDataUrl: string | null;
  assetDimensions: WorkspacePreviewAssetState['dimensions'];
  step: ScenarioCaptureStep;
}) {
  const layout = useWorkspacePreviewLayout(props);
  const markerId = `${props.step.id}-workspace-arrow-head`;
  const viewportClipId = `${props.step.id}-workspace-viewport`;

  return (
    <svg
      width={SCENARIO_STAGE_WIDTH}
      height={SCENARIO_STAGE_HEIGHT}
      viewBox={`0 0 ${SCENARIO_STAGE_WIDTH} ${SCENARIO_STAGE_HEIGHT}`}
      className="block h-full w-full select-none"
    >
      <WorkspacePreviewDefs layout={layout} markerId={markerId} viewportClipId={viewportClipId} />
      <rect
        width={SCENARIO_STAGE_WIDTH}
        height={SCENARIO_STAGE_HEIGHT}
        fill={FALLBACK_BACKGROUND_COLOR}
      />
      <WorkspacePreviewViewport
        assetDataUrl={props.assetDataUrl}
        layout={layout}
        markerId={markerId}
        step={props.step}
        viewportClipId={viewportClipId}
      />
    </svg>
  );
}
