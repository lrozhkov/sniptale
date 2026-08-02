import { translate } from '../../../platform/i18n';
import { CanvasWorkspaceToolPanel, type CanvasToolAction } from '@sniptale/ui/canvas-tools';
import {
  createCanvasToolAction,
  type CanvasToolDescriptorKind,
} from '@sniptale/ui/canvas-tools/descriptors';
import { floatingChromeClassNames } from '@sniptale/ui/floating-chrome';
import type { ScenarioCanvasViewportController } from '../../canvas/viewport-state';
import { SCENARIO_EDITOR_MODES, type ScenarioEditorMode } from '../presentation/mode';

const VIEW_CONTROLS_STACK_CLASS_NAME = floatingChromeClassNames(
  'absolute right-3 top-3 z-50 flex max-w-[calc(100vw-1.5rem)] flex-col items-end gap-3',
  'overflow-visible max-[720px]:left-3 max-[720px]:right-3 max-[720px]:top-[4.75rem]',
  'max-[720px]:items-start'
);

const VIEW_CONTROLS_PANEL_CLASS_NAME = floatingChromeClassNames(
  'flex-row items-center overflow-visible',
  'max-[720px]:w-full max-[720px]:flex-wrap max-[720px]:gap-1'
);

export function ScenarioFloatingViewControls(props: {
  controls: ScenarioCanvasViewportController['controls'];
  mode: ScenarioEditorMode;
  onModeChange: (mode: ScenarioEditorMode) => void;
}) {
  const actions = buildScenarioWorkspaceActions(props);

  return (
    <div data-ui="scenario.floating.view-controls.stack" className={VIEW_CONTROLS_STACK_CLASS_NAME}>
      <CanvasWorkspaceToolPanel
        actions={actions}
        className={VIEW_CONTROLS_PANEL_CLASS_NAME}
        dataUi="scenario.floating.workspace-panel"
        label={translate('shared.ui.commandPaletteWorkspaceSection')}
      />
    </div>
  );
}

function buildScenarioWorkspaceActions(props: {
  controls: ScenarioCanvasViewportController['controls'];
  mode: ScenarioEditorMode;
  onModeChange: (mode: ScenarioEditorMode) => void;
}) {
  return [...buildScenarioModeActions(props), ...buildScenarioZoomActions(props.controls)];
}

function buildScenarioModeActions(props: {
  mode: ScenarioEditorMode;
  onModeChange: (mode: ScenarioEditorMode) => void;
}): CanvasToolAction[] {
  const modeActions = [
    {
      id: 'mode-edit',
      kind: 'pencil',
      label: translate('scenario.editor.modeEdit'),
      mode: SCENARIO_EDITOR_MODES.edit,
    },
    {
      id: 'mode-play',
      kind: 'video',
      label: translate('scenario.editor.modePlay'),
      mode: SCENARIO_EDITOR_MODES.play,
    },
  ] satisfies Array<{
    id: string;
    kind: CanvasToolDescriptorKind;
    label: string;
    mode: ScenarioEditorMode;
  }>;

  return modeActions.map((action) =>
    createCanvasToolAction({
      active: props.mode === action.mode,
      group: 'editor',
      id: action.id,
      kind: action.kind,
      label: action.label,
      onSelect: () => props.onModeChange(action.mode),
    })
  );
}

function buildScenarioZoomActions(
  controls: ScenarioCanvasViewportController['controls']
): CanvasToolAction[] {
  const zoomPercent = Math.round(controls.scale * 100);
  const shouldFit = controls.zoomMode !== 'fit' && zoomPercent === 100;
  const zoomTitle = shouldFit
    ? translate('scenario.editor.fitToView')
    : translate('scenario.editor.zoomToActualSize');

  const zoomActions = [
    {
      group: 'primary',
      id: 'zoom-out',
      kind: 'line',
      label: translate('scenario.editor.zoomOut'),
      onSelect: controls.onZoomOut,
    },
    {
      active: controls.zoomMode === 'fit',
      group: 'primary',
      icon: <span className="min-w-10 text-center text-xs font-semibold">{zoomPercent}%</span>,
      id: 'zoom-current',
      kind: 'workspace',
      label: `${zoomTitle} · ${translate('scenario.editor.zoomCurrentPrefix')} ${zoomPercent}%`,
      onSelect: shouldFit ? controls.onFit : controls.onZoomOne,
    },
    {
      group: 'primary',
      id: 'zoom-in',
      kind: 'add-slide',
      label: translate('scenario.editor.zoomIn'),
      onSelect: controls.onZoomIn,
    },
  ] satisfies Parameters<typeof createCanvasToolAction>[0][];

  return zoomActions.map((action) => createCanvasToolAction(action));
}
