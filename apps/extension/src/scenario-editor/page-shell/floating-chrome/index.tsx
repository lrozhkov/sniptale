import { FloatingChromeRoot } from '@sniptale/ui/floating-chrome';
import { SCENARIO_EDITOR_MODES } from '../presentation/mode';
import { ScenarioFloatingDocumentBar } from './document-bar';
import { ScenarioFloatingPanels } from './panels';
import { ScenarioFloatingBuildTimeline } from './timeline';
import { ScenarioFloatingToolRail } from './tool-rail';
import type { ScenarioV3FloatingChromeProps } from './types';
import { ScenarioFloatingViewControls } from './view-controls';

export function ScenarioV3FloatingChrome(props: ScenarioV3FloatingChromeProps) {
  return (
    <FloatingChromeRoot dataUi="scenario.floating-chrome.root">
      <ScenarioFloatingDocumentBar
        editor={props.editor}
        saveStatus={props.saveStatus}
        onOpenExport={props.onOpenExport}
        onToggleAi={props.onToggleAi}
      />
      {props.mode === SCENARIO_EDITOR_MODES.edit ? (
        <ScenarioFloatingToolRail
          activeInsertKind={props.activeInsertKind}
          editor={props.editor}
          templatePickerOpen={props.templatePickerOpen}
          onActiveInsertKindChange={props.onActiveInsertKindChange}
          onToggleTemplatePicker={props.onToggleTemplatePicker}
        />
      ) : null}
      <ScenarioFloatingViewControls
        controls={props.canvasControls}
        mode={props.mode}
        onModeChange={props.onModeChange}
      />
      {props.mode === SCENARIO_EDITOR_MODES.edit ? <ScenarioFloatingEditChrome {...props} /> : null}
    </FloatingChromeRoot>
  );
}

function ScenarioFloatingEditChrome(props: ScenarioV3FloatingChromeProps) {
  return (
    <>
      <ScenarioFloatingPanels
        assets={props.assets}
        canvasControls={props.canvasControls}
        editor={props.editor}
        inspectorTool={props.inspectorTool}
        inspectorHidden={props.rightPanelHidden ?? false}
        templatePickerOpen={props.templatePickerOpen}
        templates={props.templates}
        onClearInspectorTool={props.onClearInspectorTool}
        onEditImageElement={props.onEditImageElement}
        onOpenExport={props.onOpenExport}
        onToggleTemplatePicker={props.onToggleTemplatePicker}
      />
      <ScenarioFloatingBuildTimeline
        clickIndex={props.clickIndex}
        hidden={props.timelineHidden}
        onClickIndexChange={props.onClickIndexChange}
        onHiddenChange={props.onTimelineHiddenChange}
        selectedElementId={props.editor.selectedElementId}
        slide={props.editor.selectedSlide}
      />
    </>
  );
}
