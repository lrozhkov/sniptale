import type {
  ScenarioCaptureStep,
  ScenarioStepPatch,
} from '../../../features/scenario/contracts/types/project';
import { ScenarioQuickEditTransformSections } from './ScenarioQuickEditTransformSections';
import { QuickEditOverlayList } from './sidebar.overlays';
import { QuickEditStepFields } from './sidebar.sections';

export function ScenarioQuickEditSidebar(props: {
  canRedo: boolean;
  canUndo: boolean;
  onSelectOverlay: (overlayId: string | null) => void;
  onRedo: () => void;
  onStepChange: (patch: Partial<ScenarioStepPatch>) => void;
  onUndo: () => void;
  selectedOverlayId: string | null;
  step: ScenarioCaptureStep;
}) {
  return (
    <aside
      data-ui="scenario.editor.quick-edit.sidebar"
      className={[
        'grid min-h-0 gap-4 overflow-auto rounded-[24px] border p-4',
        'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_84%,transparent)]',
        'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_94%,var(--sniptale-color-surface-canvas)_6%)]',
      ].join(' ')}
    >
      <QuickEditStepFields
        canRedo={props.canRedo}
        canUndo={props.canUndo}
        onRedo={props.onRedo}
        onStepChange={props.onStepChange}
        onUndo={props.onUndo}
        step={props.step}
      />

      <ScenarioQuickEditTransformSections
        step={props.step}
        onStepChange={(patch) => props.onStepChange(patch)}
      />

      <QuickEditOverlayList
        overlays={props.step.overlays}
        selectedOverlayId={props.selectedOverlayId}
        onOverlayChange={(overlayId, overlays) => {
          props.onStepChange({ overlays });
          props.onSelectOverlay(overlayId);
        }}
        onOverlayRemove={(overlayId) => {
          const overlays = props.step.overlays.filter((overlay) => overlay.id !== overlayId);
          props.onStepChange({ overlays });
          props.onSelectOverlay(overlays[0]?.id ?? null);
        }}
        onSelectOverlay={props.onSelectOverlay}
      />
    </aside>
  );
}
