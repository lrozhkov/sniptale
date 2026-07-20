export type GridWorkspaceUpdates = Partial<{
  gridEnabled: boolean;
  gridSnapEnabled: boolean;
  gridSize: number;
  gridColor: string;
}>;

export type GridPanelBodyProps = {
  applyGridColor: (color: string) => void;
  clampGridSize: (value: number) => number;
  gridColor: string;
  gridEnabled: boolean;
  gridPalette: readonly string[];
  gridSize: number;
  gridSizeMax: number;
  gridSizeMin: number;
  gridSnapEnabled: boolean;
  recentColors: string[];
  updateWorkspace: (updates: GridWorkspaceUpdates) => void;
};
