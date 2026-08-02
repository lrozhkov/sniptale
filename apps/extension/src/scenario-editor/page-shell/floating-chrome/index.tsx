import { FloatingChromeRoot } from '@sniptale/ui/floating-chrome';
import { SCENARIO_EDITOR_MODES } from '../presentation/mode';
import { ScenarioFloatingDocumentBar } from './document-bar';
import { ScenarioFloatingPanels } from './panels';
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
        <ScenarioFloatingToolRail editor={props.editor} />
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
        editor={props.editor}
        inspectorTool={props.inspectorTool}
        inspectorHidden={props.rightPanelHidden ?? false}
        onClearInspectorTool={props.onClearInspectorTool}
        onEditImageElement={props.onEditImageElement}
        onOpenExport={props.onOpenExport}
      />
    </>
  );
}
