import { translate } from '../../../../../platform/i18n';

import { NumericRow } from '../../../../chrome/ui';
import type { GridWorkspaceUpdates } from '../../types';

export function EditorInspectorGridSizeSection(props: {
  clampGridSize: (value: number) => number;
  gridSize: number;
  gridSizeMax: number;
  gridSizeMin: number;
  updateWorkspace: (updates: GridWorkspaceUpdates) => void;
}) {
  return (
    <NumericRow
      label={translate('editor.compact.dimension')}
      value={props.gridSize}
      unit="px"
      min={props.gridSizeMin}
      max={props.gridSizeMax}
      step={2}
      onPreviewValue={(value) => props.updateWorkspace({ gridSize: props.clampGridSize(value) })}
      onCommitValue={(value) => props.updateWorkspace({ gridSize: props.clampGridSize(value) })}
      scrub={{ min: props.gridSizeMin, max: props.gridSizeMax, step: 2 }}
    />
  );
}
