import { translate } from '../../../../platform/i18n';
import { EDITOR_TOOL_SHAPE_STROKE_PALETTE } from '../../../../features/editor/document/constants';
import { useEditorStore } from '../../../state/useEditorStore';
import {
  CompactColorSwatchTrigger,
  CompactCommandField,
  CompactCommandToken,
  type CompactCommand,
} from '..';
import {
  getRasterSelectionModeLabel,
  getRasterSelectionTargetLabel,
  rasterSelectionModeOptions,
} from '../../raster/options';
import { ColorField, NumericRow, SegmentedSelector } from '../../../chrome/ui';
import { TablerIcon } from '../tabler-icon';
export { buildRasterFillCompactCommands } from './raster-fill';

function getRasterSelectionModeIcon(value: string) {
  if (value === 'wand') {
    return <TablerIcon icon="tabler:paint" />;
  }
  if (value === 'lasso') {
    return <TablerIcon icon="tabler:lasso" />;
  }

  return <TablerIcon icon="tabler:select" />;
}

export function buildRasterSelectionCompactCommands(controller: {
  clearRasterSelection?: () => void;
}): CompactCommand[] {
  const state = useEditorStore.getState();
  const { rasterSelection, rasterToolSettings } = state;
  const label = translate('editor.sidebar.rasterSelectionMode');

  return [
    {
      id: 'raster-selection-mode',
      title: label,
      trigger: getRasterSelectionModeIcon(rasterToolSettings.selectionMode),
      value: getRasterSelectionModeLabel(rasterToolSettings.selectionMode),
      content: (
        <CompactCommandField label={label}>
          <SegmentedSelector
            ariaLabel={label}
            value={rasterToolSettings.selectionMode}
            onChange={(selectionMode) => state.updateRasterToolSettings({ selectionMode })}
            options={rasterSelectionModeOptions.map((option) => ({
              ...option,
              icon: getRasterSelectionModeIcon(option.value),
            }))}
            columns={3}
          />
        </CompactCommandField>
      ),
    },
    {
      id: 'raster-selection-clear',
      title: translate('editor.sidebar.rasterSelectionClear'),
      trigger: <TablerIcon icon="tabler:bucket-off" />,
      disabled: !rasterSelection.hasSelection,
      value: getRasterSelectionTargetLabel(rasterSelection),
      onClick: () => controller.clearRasterSelection?.(),
    },
  ];
}

export function buildRasterEraserCompactCommands(controller: {
  clearRasterSelection?: () => void;
}): CompactCommand[] {
  const state = useEditorStore.getState();
  const { rasterSelection, rasterToolSettings } = state;
  const label = translate('editor.sidebar.rasterEraserSize');

  return [
    {
      id: 'raster-eraser-size',
      title: label,
      trigger: <CompactCommandToken>{`${rasterToolSettings.eraserSize}px`}</CompactCommandToken>,
      value: String(rasterToolSettings.eraserSize),
      content: (
        <CompactCommandField label={label} value={String(rasterToolSettings.eraserSize)}>
          <NumericRow
            label={label}
            value={rasterToolSettings.eraserSize}
            unit="px"
            min={8}
            max={120}
            step={1}
            onPreviewValue={(eraserSize) => state.updateRasterToolSettings({ eraserSize })}
            onCommitValue={(eraserSize) => state.updateRasterToolSettings({ eraserSize })}
            scrub={{ min: 8, max: 120, step: 1 }}
          />
        </CompactCommandField>
      ),
    },
    {
      id: 'raster-eraser-clear',
      title: translate('editor.sidebar.rasterSelectionClear'),
      trigger: <TablerIcon icon="tabler:bucket-off" />,
      disabled: !rasterSelection.hasSelection,
      value: getRasterSelectionTargetLabel(rasterSelection),
      onClick: () => controller.clearRasterSelection?.(),
    },
  ];
}

export function buildRasterBrushCompactCommands(controller: {
  clearRasterSelection?: () => void;
}): CompactCommand[] {
  const state = useEditorStore.getState();
  const { rasterSelection } = state;

  return [
    createRasterBrushSizeCommand(state),
    createRasterBrushColorCommand(state),
    createRasterBrushPercentCommand(state, 'opacity'),
    createRasterBrushPercentCommand(state, 'hardness'),
    {
      id: 'raster-brush-clear',
      title: translate('editor.sidebar.rasterSelectionClear'),
      trigger: <TablerIcon icon="tabler:bucket-off" />,
      disabled: !rasterSelection.hasSelection,
      value: getRasterSelectionTargetLabel(rasterSelection),
      onClick: () => controller.clearRasterSelection?.(),
    },
  ];
}

function createRasterBrushSizeCommand(
  state: ReturnType<typeof useEditorStore.getState>
): CompactCommand {
  const { rasterToolSettings } = state;
  const label = translate('editor.sidebar.rasterBrushSize');
  return {
    id: 'raster-brush-size',
    title: label,
    trigger: <CompactCommandToken>{`${rasterToolSettings.brushSize}px`}</CompactCommandToken>,
    value: String(rasterToolSettings.brushSize),
    content: (
      <CompactCommandField label={label} value={`${rasterToolSettings.brushSize}px`}>
        <NumericRow
          label={label}
          value={rasterToolSettings.brushSize}
          unit="px"
          min={1}
          max={200}
          step={1}
          onPreviewValue={(brushSize) => state.updateRasterToolSettings({ brushSize })}
          onCommitValue={(brushSize) => state.updateRasterToolSettings({ brushSize })}
          scrub={{ min: 1, max: 200, step: 1 }}
        />
      </CompactCommandField>
    ),
  };
}

function createRasterBrushColorCommand(
  state: ReturnType<typeof useEditorStore.getState>
): CompactCommand {
  const { rasterToolSettings } = state;
  const label = translate('editor.sidebar.rasterBrushColor');
  return {
    id: 'raster-brush-color',
    icon: 'color',
    title: label,
    trigger: (
      <CompactColorSwatchTrigger
        color={rasterToolSettings.brushColor}
        opacity={rasterToolSettings.brushOpacity}
      />
    ),
    value: rasterToolSettings.brushColor,
    content: (
      <CompactCommandField label={label} value={rasterToolSettings.brushColor}>
        <ColorField
          title={label}
          label={label}
          value={rasterToolSettings.brushColor}
          palette={EDITOR_TOOL_SHAPE_STROKE_PALETTE}
          onChange={(brushColor) => state.updateRasterToolSettings({ brushColor })}
        />
      </CompactCommandField>
    ),
  };
}

function createRasterBrushPercentCommand(
  state: ReturnType<typeof useEditorStore.getState>,
  kind: 'opacity' | 'hardness'
): CompactCommand {
  const settingKey = kind === 'opacity' ? 'brushOpacity' : 'brushHardness';
  const label = translate(
    `editor.sidebar.rasterBrush${kind === 'opacity' ? 'Opacity' : 'Hardness'}`
  );
  const value = Math.round(state.rasterToolSettings[settingKey] * 100);
  return {
    id: `raster-brush-${kind}`,
    icon: 'opacity',
    title: label,
    trigger:
      kind === 'opacity' ? (
        <CompactCommandToken>OP</CompactCommandToken>
      ) : (
        <TablerIcon icon="tabler:contrast-filled" />
      ),
    value: `${value}%`,
    content: (
      <CompactCommandField label={label} value={`${value}%`}>
        <NumericRow
          label={label}
          value={value}
          unit="%"
          min={0}
          max={100}
          step={1}
          onPreviewValue={(nextValue) =>
            state.updateRasterToolSettings({ [settingKey]: nextValue / 100 })
          }
          onCommitValue={(nextValue) =>
            state.updateRasterToolSettings({ [settingKey]: nextValue / 100 })
          }
          scrub={{ min: 0, max: 100, step: 1 }}
        />
      </CompactCommandField>
    ),
  };
}
