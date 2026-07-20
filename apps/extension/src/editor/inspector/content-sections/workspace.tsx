import {
  EditorInspectorGridPanel,
  EditorInspectorMetaPanel,
  EditorInspectorWorkspacePanel,
} from '../environment';

import type { EditorWorkspaceSettings } from '../../../features/editor/document/types';

interface EditorInspectorContentWorkspaceSectionsProps {
  inspector: string;
  workspace: EditorWorkspaceSettings;
  workspaceColorError: string | null;
  workspaceColorMatchesDefault: boolean;
  workspaceDefaultSavePending: boolean;
  workspaceBackgroundPalette: readonly string[];
  gridPalette: readonly string[];
  gridSizeMin: number;
  gridSizeMax: number;
  recentColors: string[];
  clampGridSize: (value: number) => number;
  updateColor: (setter: (value: string) => void, color: string) => void;
  applyWorkspaceColor: (color: string) => Promise<void> | void;
  saveWorkspaceColorAsDefault: () => Promise<void> | void;
  updateWorkspace: (patch: Partial<EditorWorkspaceSettings>) => void;
}

export function renderEditorInspectorContentWorkspaceSections(
  props: EditorInspectorContentWorkspaceSectionsProps
) {
  if (props.inspector === 'workspace') {
    return (
      <EditorInspectorWorkspacePanel
        workspaceBackgroundColor={props.workspace.backgroundColor}
        workspaceColorError={props.workspaceColorError}
        workspaceColorMatchesDefault={props.workspaceColorMatchesDefault}
        workspaceDefaultSavePending={props.workspaceDefaultSavePending}
        palette={props.workspaceBackgroundPalette}
        previewWorkspaceColor={(color) => props.updateWorkspace({ backgroundColor: color })}
        recentColors={props.recentColors}
        applyWorkspaceColor={props.applyWorkspaceColor}
        saveWorkspaceColorAsDefault={props.saveWorkspaceColorAsDefault}
      />
    );
  }

  if (props.inspector === 'grid') {
    return (
      <EditorInspectorGridPanel
        gridEnabled={props.workspace.gridEnabled}
        gridSnapEnabled={props.workspace.gridSnapEnabled}
        gridSize={props.workspace.gridSize}
        gridColor={props.workspace.gridColor}
        gridSizeMin={props.gridSizeMin}
        gridSizeMax={props.gridSizeMax}
        gridPalette={props.gridPalette}
        recentColors={props.recentColors}
        clampGridSize={props.clampGridSize}
        updateWorkspace={props.updateWorkspace}
        applyGridColor={(color) =>
          props.updateColor((next) => props.updateWorkspace({ gridColor: next }), color)
        }
      />
    );
  }

  return <EditorInspectorMetaPanel />;
}
