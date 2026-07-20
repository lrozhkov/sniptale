import type { resolveScenarioStageLayout } from '../../../features/scenario/stage/layout';
import type { ScenarioCaptureStep } from '../../../features/scenario/contracts/types/project';
import type { ScenarioQuickEditDragState } from './stage.types';
import {
  ArrowOverlayNode,
  isRectNavigatorOverlay,
  PointOverlayNode,
  RectOverlayNode,
} from './ScenarioQuickEditOverlayLayer.nodes';

type QuickEditOverlayNodeProps = {
  beginDrag: (state: ScenarioQuickEditDragState) => void;
  layout: NonNullable<ReturnType<typeof resolveScenarioStageLayout>>;
  onSelectOverlay: (overlayId: string | null) => void;
  overlay: ScenarioCaptureStep['overlays'][number];
  selectedOverlayId: string | null;
  step: ScenarioCaptureStep;
};

function QuickEditOverlayNode(props: QuickEditOverlayNodeProps) {
  const selected = props.overlay.id === props.selectedOverlayId;

  if (props.overlay.kind === 'arrow') {
    return (
      <ArrowOverlayNode
        beginDrag={props.beginDrag}
        layout={props.layout}
        onSelectOverlay={props.onSelectOverlay}
        overlay={props.overlay}
        selected={selected}
        step={props.step}
      />
    );
  }

  if (isRectNavigatorOverlay(props.overlay)) {
    return (
      <RectOverlayNode
        beginDrag={props.beginDrag}
        layout={props.layout}
        onSelectOverlay={props.onSelectOverlay}
        overlay={props.overlay}
        selected={selected}
        step={props.step}
      />
    );
  }

  return (
    <PointOverlayNode
      beginDrag={props.beginDrag}
      layout={props.layout}
      onSelectOverlay={props.onSelectOverlay}
      overlay={props.overlay}
      selected={selected}
      step={props.step}
    />
  );
}

export function ScenarioQuickEditStageOverlayLayer(props: {
  beginDrag: (state: ScenarioQuickEditDragState) => void;
  layout: NonNullable<ReturnType<typeof resolveScenarioStageLayout>>;
  onSelectOverlay: (overlayId: string | null) => void;
  selectedOverlayId: string | null;
  step: ScenarioCaptureStep;
}) {
  return (
    <div className="pointer-events-none absolute inset-0">
      {props.step.overlays.map((overlay) => {
        return (
          <QuickEditOverlayNode
            key={overlay.id}
            beginDrag={props.beginDrag}
            layout={props.layout}
            onSelectOverlay={props.onSelectOverlay}
            overlay={overlay}
            selectedOverlayId={props.selectedOverlayId}
            step={props.step}
          />
        );
      })}
    </div>
  );
}
