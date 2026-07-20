import { translate } from '../../../../../platform/i18n';

import { ColorField } from '../../../../chrome/ui';
import type { GridPanelBodyProps } from '../../types';
import { EditorInspectorGridPresetSection } from './preset-section';
import { EditorInspectorGridSizeSection } from './size-section';

type GridStyleSectionsProps = Pick<
  GridPanelBodyProps,
  | 'applyGridColor'
  | 'clampGridSize'
  | 'gridColor'
  | 'gridPalette'
  | 'gridSize'
  | 'gridSizeMax'
  | 'gridSizeMin'
  | 'recentColors'
  | 'updateWorkspace'
>;

export function EditorInspectorGridStyleSections({
  applyGridColor,
  clampGridSize,
  gridColor,
  gridPalette,
  gridSize,
  gridSizeMax,
  gridSizeMin,
  recentColors,
  updateWorkspace,
}: GridStyleSectionsProps) {
  return (
    <div className="space-y-3">
      <ColorField
        title={translate('editor.compact.gridLineColor')}
        label={translate('editor.compact.gridLines')}
        value={gridColor}
        recentColors={recentColors}
        palette={gridPalette}
        onChange={applyGridColor}
        onPreviewChange={(color) => updateWorkspace({ gridColor: color })}
        onPreviewReset={(color) => updateWorkspace({ gridColor: color })}
      />
      <EditorInspectorGridPresetSection
        applyGridColor={applyGridColor}
        gridColor={gridColor}
        gridPalette={gridPalette}
      />
      <EditorInspectorGridSizeSection
        clampGridSize={clampGridSize}
        gridSize={gridSize}
        gridSizeMax={gridSizeMax}
        gridSizeMin={gridSizeMin}
        updateWorkspace={updateWorkspace}
      />
    </div>
  );
}
