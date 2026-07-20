import { Eye, Grid2X2, MonitorPlay, PencilLine } from 'lucide-react';
import type { ReactNode } from 'react';
import { translate } from '../../../platform/i18n';
import { ScenarioCanvasZoomControls } from '../../canvas/controls';
import type { ScenarioCanvasViewportControls } from '../../canvas/viewport-state';
import {
  EditorIconButton,
  EditorToolbarDivider,
  EditorToolbarSection,
  EditorToolbarShell,
} from '@sniptale/ui/editor-chrome';
import {
  InspectorShellHeaderSegment,
  INSPECTOR_SHELL_FIXED_HEADER_CLASS_NAME,
} from '@sniptale/ui/inspector-shell';
import { SCENARIO_INSPECTOR_WIDTH_CLASS_NAME } from '../../inspector/layout';
import { ScenarioElementInsertMenu } from './insert-menu';
import type { ScenarioEditorMode } from '../presentation/mode';
import { SCENARIO_EDITOR_MODES } from '../presentation/mode';
import {
  ScenarioAiActionButton,
  ScenarioExportActionButton,
  ScenarioHistoryActionButtons,
} from '../scenario-toolbar-actions';
import type { useScenarioV3EditorState } from '../state';

type ScenarioV3EditorState = ReturnType<typeof useScenarioV3EditorState>;

export function ScenarioV3ShellToolbar(props: {
  canvasControls: ScenarioCanvasViewportControls | null;
  editor: ScenarioV3EditorState;
  mode: ScenarioEditorMode;
  onToggleAi: () => void;
  onModeChange: (mode: ScenarioEditorMode) => void;
  onOpenExport: () => void;
  onOpenGridTool: () => void;
}) {
  return (
    <EditorToolbarShell className={INSPECTOR_SHELL_FIXED_HEADER_CLASS_NAME}>
      <ScenarioToolbarDeckSummary editor={props.editor} />
      <div className="flex min-w-0 flex-1 items-center px-3 py-2">
        <div
          className="flex min-w-0 flex-1 items-center gap-y-1 overflow-x-auto [scrollbar-width:none]"
          data-ui="scenario.toolbar.groups"
        >
          <EditorModeButtons mode={props.mode} onModeChange={props.onModeChange} />
          <EditorToolbarDivider />
          {props.mode === SCENARIO_EDITOR_MODES.edit ? (
            <>
              <ScenarioElementInsertMenu
                onInsertElement={props.editor.elementActions.insertElement}
              />
              <EditorToolbarDivider />
              {props.canvasControls ? (
                <>
                  <ScenarioCanvasZoomControls {...props.canvasControls} />
                  <EditorToolbarDivider />
                  <ScenarioGridToolButton onOpenGridTool={props.onOpenGridTool} />
                  <EditorToolbarDivider />
                </>
              ) : null}
            </>
          ) : null}
          <ExportButton onOpenExport={props.onOpenExport} />
          <EditorToolbarDivider />
          <ScenarioAiEntryPoint onToggleAi={props.onToggleAi} />
          <EditorToolbarDivider />
          <HistoryButtons editor={props.editor} />
        </div>
      </div>
    </EditorToolbarShell>
  );
}

function ScenarioToolbarDeckSummary(props: { editor: ScenarioV3EditorState }) {
  return (
    <InspectorShellHeaderSegment
      expandedWidthClassName={SCENARIO_INSPECTOR_WIDTH_CLASS_NAME}
      className="px-4"
      dataUi="scenario.toolbar.deck-summary"
    >
      <div className="grid min-w-0 flex-1 gap-1">
        <span className="truncate text-sm font-semibold text-[var(--sniptale-color-text-primary)]">
          {props.editor.project.name}
        </span>
      </div>
    </InspectorShellHeaderSegment>
  );
}

function ScenarioGridToolButton(props: { onOpenGridTool: () => void }) {
  return (
    <EditorToolbarSection dataUi="scenario.toolbar.grid-tool-group">
      <EditorIconButton
        title={translate('scenario.editor.toggleGrid')}
        onClick={props.onOpenGridTool}
      >
        <Grid2X2 size={18} strokeWidth={2} />
      </EditorIconButton>
    </EditorToolbarSection>
  );
}

function ExportButton(props: { onOpenExport: () => void }) {
  return (
    <EditorToolbarSection dataUi="scenario.toolbar.export-group">
      <ScenarioExportActionButton onOpenExport={props.onOpenExport} />
    </EditorToolbarSection>
  );
}

function ScenarioAiEntryPoint(props: { onToggleAi: () => void }) {
  return (
    <EditorToolbarSection dataUi="scenario.toolbar.ai-group">
      <ScenarioAiActionButton onToggleAi={props.onToggleAi} />
    </EditorToolbarSection>
  );
}

function HistoryButtons(props: { editor: ScenarioV3EditorState }) {
  return (
    <EditorToolbarSection dataUi="scenario.toolbar.history-group">
      <ScenarioHistoryActionButtons editor={props.editor} />
    </EditorToolbarSection>
  );
}

function EditorModeButtons(props: {
  mode: ScenarioEditorMode;
  onModeChange: (mode: ScenarioEditorMode) => void;
}) {
  return (
    <EditorToolbarSection dataUi="scenario.toolbar.mode-group">
      <ModeButton
        active={props.mode === SCENARIO_EDITOR_MODES.edit}
        title={translate('scenario.editor.modeEdit')}
        onClick={() => props.onModeChange(SCENARIO_EDITOR_MODES.edit)}
      >
        <PencilLine size={18} strokeWidth={2} />
      </ModeButton>
      <ModeButton
        active={props.mode === SCENARIO_EDITOR_MODES.play}
        title={translate('scenario.editor.modePlay')}
        onClick={() => props.onModeChange(SCENARIO_EDITOR_MODES.play)}
      >
        <MonitorPlay size={18} strokeWidth={2} />
      </ModeButton>
      <ModeButton
        active={props.mode === SCENARIO_EDITOR_MODES.presenter}
        title={translate('scenario.editor.modePresenter')}
        onClick={() => props.onModeChange(SCENARIO_EDITOR_MODES.presenter)}
      >
        <Eye size={18} strokeWidth={2} />
      </ModeButton>
      <ModeButton
        active={props.mode === SCENARIO_EDITOR_MODES.overview}
        title={translate('scenario.editor.modeOverview')}
        onClick={() => props.onModeChange(SCENARIO_EDITOR_MODES.overview)}
      >
        <Grid2X2 size={18} strokeWidth={2} />
      </ModeButton>
    </EditorToolbarSection>
  );
}

function ModeButton(props: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
  title: string;
}) {
  return (
    <EditorIconButton active={props.active} title={props.title} onClick={props.onClick}>
      {props.children}
    </EditorIconButton>
  );
}
