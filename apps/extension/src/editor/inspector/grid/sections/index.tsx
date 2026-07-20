import type { GridPanelBodyProps } from '../types';
import { EditorInspectorGridStyleSections, EditorInspectorGridToggleSections } from './shared';

export function GridPanelSections(props: GridPanelBodyProps) {
  return (
    <div className="space-y-3">
      <EditorInspectorGridToggleSections
        gridEnabled={props.gridEnabled}
        gridSnapEnabled={props.gridSnapEnabled}
        updateWorkspace={props.updateWorkspace}
      />
      <EditorInspectorGridStyleSections
        applyGridColor={props.applyGridColor}
        clampGridSize={props.clampGridSize}
        gridColor={props.gridColor}
        gridPalette={props.gridPalette}
        gridSize={props.gridSize}
        gridSizeMax={props.gridSizeMax}
        gridSizeMin={props.gridSizeMin}
        recentColors={props.recentColors}
        updateWorkspace={props.updateWorkspace}
      />
    </div>
  );
}
