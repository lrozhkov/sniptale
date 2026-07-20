import { translate } from '../../../../platform/i18n';
import { CompactCommandField, CompactCommandToken, type CompactCommand } from '..';
import type { InspectorCommandParams } from './command-types';
import { ColorField, NumericRow } from '../../../chrome/ui';

function buildGridSizeCommand(params: InspectorCommandParams): CompactCommand {
  return {
    id: 'grid-size',
    icon: 'size',
    title: translate('editor.compact.gridSize'),
    trigger: <CompactCommandToken>PX</CompactCommandToken>,
    value: `${params.workspace.gridSize}px`,
    content: (
      <CompactCommandField
        label={translate('editor.compact.dimension')}
        value={`${params.workspace.gridSize}px`}
      >
        <NumericRow
          label={translate('editor.compact.gridSize')}
          value={params.workspace.gridSize}
          unit="px"
          min={params.gridSizeMin}
          max={params.gridSizeMax}
          step={2}
          onPreviewValue={(value) =>
            params.updateWorkspace({
              gridSize: params.clampGridSize(value),
            })
          }
          onCommitValue={(value) =>
            params.updateWorkspace({
              gridSize: params.clampGridSize(value),
            })
          }
          scrub={{ min: params.gridSizeMin, max: params.gridSizeMax, step: 2 }}
        />
      </CompactCommandField>
    ),
  };
}

function buildGridColorCommand(params: InspectorCommandParams): CompactCommand {
  return {
    id: 'grid-color',
    icon: 'color',
    title: translate('editor.compact.gridLineColor'),
    trigger: <CompactCommandToken>CLR</CompactCommandToken>,
    value: params.workspace.gridColor,
    content: (
      <CompactCommandField
        label={translate('editor.compact.gridLines')}
        value={params.workspace.gridColor}
      >
        <ColorField
          title={translate('editor.compact.gridLineColor')}
          label={translate('editor.compact.gridLines')}
          value={params.workspace.gridColor}
          recentColors={params.recentColors}
          palette={params.gridColorPalette}
          onChange={(color) =>
            params.updateColor((next) => params.updateWorkspace({ gridColor: next }), color)
          }
          onPreviewChange={(color) => params.updateWorkspace({ gridColor: color })}
          onPreviewReset={(color) => params.updateWorkspace({ gridColor: color })}
        />
      </CompactCommandField>
    ),
  };
}

export function buildGridStyleCommands(params: InspectorCommandParams): CompactCommand[] {
  return [buildGridColorCommand(params), buildGridSizeCommand(params)];
}
