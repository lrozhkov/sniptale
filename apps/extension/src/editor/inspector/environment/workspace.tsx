import React from 'react';
import { useAppLocale } from '../../../platform/i18n';
import { WorkspacePanelBody } from './disclosure';
import { GridPanelBody } from '../grid/disclosure';
import type { GridPanelBodyProps } from '../grid/types';

export const EditorInspectorWorkspacePanelContent: React.FC<{
  applyWorkspaceColor: (color: string) => void;
  palette: readonly string[];
  previewWorkspaceColor: (color: string) => void;
  recentColors: string[];
  workspaceBackgroundColor: string;
  workspaceColorError: string | null;
  workspaceColorMatchesDefault: boolean;
  workspaceDefaultSavePending: boolean;
  saveWorkspaceColorAsDefault: () => Promise<void> | void;
}> = ({
  applyWorkspaceColor,
  palette,
  previewWorkspaceColor,
  recentColors,
  workspaceBackgroundColor,
  workspaceColorError,
  workspaceColorMatchesDefault,
  workspaceDefaultSavePending,
  saveWorkspaceColorAsDefault,
}) => {
  useAppLocale();

  return (
    <WorkspacePanelBody
      applyWorkspaceColor={applyWorkspaceColor}
      palette={palette}
      previewWorkspaceColor={previewWorkspaceColor}
      recentColors={recentColors}
      workspaceBackgroundColor={workspaceBackgroundColor}
      workspaceColorError={workspaceColorError}
      workspaceColorMatchesDefault={workspaceColorMatchesDefault}
      workspaceDefaultSavePending={workspaceDefaultSavePending}
      saveWorkspaceColorAsDefault={saveWorkspaceColorAsDefault}
    />
  );
};

export const EditorInspectorGridPanelContent: React.FC<GridPanelBodyProps> = ({
  applyGridColor,
  clampGridSize,
  gridColor,
  gridEnabled,
  gridPalette,
  gridSize,
  gridSizeMax,
  gridSizeMin,
  gridSnapEnabled,
  recentColors,
  updateWorkspace,
}) => {
  useAppLocale();

  return (
    <GridPanelBody
      applyGridColor={applyGridColor}
      clampGridSize={clampGridSize}
      gridColor={gridColor}
      gridEnabled={gridEnabled}
      gridPalette={gridPalette}
      gridSize={gridSize}
      gridSizeMax={gridSizeMax}
      gridSizeMin={gridSizeMin}
      gridSnapEnabled={gridSnapEnabled}
      recentColors={recentColors}
      updateWorkspace={updateWorkspace}
    />
  );
};
