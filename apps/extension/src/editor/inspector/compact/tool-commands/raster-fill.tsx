import {
  createEditorGradientFallbackStops,
  normalizeEditorGradientStops,
  type EditorGradientColorStop,
} from '../../../../features/editor/document/gradient';
import { EDITOR_TOOL_SHAPE_STROKE_PALETTE } from '../../../../features/editor/document/constants';
import { translate } from '../../../../platform/i18n';
import { EDITOR_RASTER_FILL_MODE } from '../../../state/raster-tools';
import { useEditorStore } from '../../../state/useEditorStore';
import { CompactColorSwatchTrigger, CompactCommandField, type CompactCommand } from '..';
import {
  getRasterFillModeLabel,
  getRasterSelectionTargetLabel,
  rasterFillModeOptions,
} from '../../raster/options';
import { EditorGradientControls, createGradientEditorBackground } from '../../gradient';
import { ColorField, SegmentedSelector } from '../../../chrome/ui';
import { TablerIcon } from '../tabler-icon';

function getRasterFillModeIcon(value: string) {
  if (value === EDITOR_RASTER_FILL_MODE.LINEAR_GRADIENT) {
    return <TablerIcon icon="tabler:squares-diagonal" />;
  }

  return <TablerIcon icon="tabler:bucket" />;
}

function createGradientPatch(
  gradientFrom: string,
  gradientTo: string,
  stops: EditorGradientColorStop[]
) {
  return {
    gradientFrom: stops[0]?.color ?? gradientFrom,
    gradientTo: stops.at(-1)?.color ?? gradientTo,
    gradientStops: stops,
  };
}

export function buildRasterFillCompactCommands(controller: {
  clearRasterSelection?: () => void;
}): CompactCommand[] {
  const state = useEditorStore.getState();
  const { rasterToolSettings, rasterSelection } = state;
  const label = translate('editor.sidebar.rasterFillMode');
  const gradientStops = normalizeEditorGradientStops(
    rasterToolSettings.gradientStops,
    createEditorGradientFallbackStops(
      rasterToolSettings.gradientFrom,
      rasterToolSettings.gradientTo
    )
  );

  return [
    {
      id: 'raster-fill-mode',
      title: label,
      trigger: getRasterFillModeIcon(rasterToolSettings.fillMode),
      value: getRasterFillModeLabel(rasterToolSettings.fillMode),
      content: (
        <CompactCommandField label={label}>
          <SegmentedSelector
            ariaLabel={label}
            value={rasterToolSettings.fillMode}
            onChange={(fillMode) => state.updateRasterToolSettings({ fillMode })}
            options={rasterFillModeOptions.map((option) => ({
              ...option,
              icon: getRasterFillModeIcon(option.value),
            }))}
            columns={2}
          />
        </CompactCommandField>
      ),
    },
    createRasterFillValueCommand(state, gradientStops),
    {
      id: 'raster-fill-selection',
      title: translate('editor.sidebar.rasterSelectionClear'),
      trigger: <TablerIcon icon="tabler:bucket-off" />,
      disabled: !rasterSelection.hasSelection,
      value: getRasterSelectionTargetLabel(rasterSelection),
      onClick: () => controller.clearRasterSelection?.(),
    },
  ];
}

function createRasterFillValueCommand(
  state: ReturnType<typeof useEditorStore.getState>,
  gradientStops: EditorGradientColorStop[]
): CompactCommand {
  const { rasterToolSettings } = state;
  if (rasterToolSettings.fillMode === EDITOR_RASTER_FILL_MODE.LINEAR_GRADIENT) {
    return createRasterFillGradientCommand(state, gradientStops);
  }

  return createRasterFillColorCommand(state);
}

function createRasterFillGradientCommand(
  state: ReturnType<typeof useEditorStore.getState>,
  gradientStops: EditorGradientColorStop[]
): CompactCommand {
  const { rasterToolSettings } = state;
  return {
    id: 'raster-fill-gradient',
    title: translate('editor.gradient.editor'),
    trigger: (
      <span
        className="block h-5 w-5 rounded-full border border-[color:var(--sniptale-color-border-soft)]"
        style={{ backgroundImage: createGradientEditorBackground(gradientStops) }}
      />
    ),
    value: getRasterFillModeLabel(rasterToolSettings.fillMode),
    content: (
      <CompactCommandField label={translate('editor.gradient.editor')}>
        <EditorGradientControls
          angle={0}
          stops={gradientStops}
          palette={EDITOR_TOOL_SHAPE_STROKE_PALETTE}
          onStopsChange={(stops) =>
            state.updateRasterToolSettings(
              createGradientPatch(
                rasterToolSettings.gradientFrom,
                rasterToolSettings.gradientTo,
                stops
              )
            )
          }
          onAngleChange={() => undefined}
          showAngle={false}
        />
      </CompactCommandField>
    ),
  };
}

function createRasterFillColorCommand(
  state: ReturnType<typeof useEditorStore.getState>
): CompactCommand {
  const { rasterToolSettings } = state;
  return {
    id: 'raster-fill-color',
    icon: 'color',
    title: translate('editor.sidebar.rasterFillColor'),
    trigger: <CompactColorSwatchTrigger color={rasterToolSettings.fillColor} opacity={1} />,
    value: rasterToolSettings.fillColor,
    content: (
      <CompactCommandField
        label={translate('editor.sidebar.rasterFillColor')}
        value={rasterToolSettings.fillColor}
      >
        <ColorField
          title={translate('editor.sidebar.rasterFillColor')}
          label={translate('editor.sidebar.rasterFillColor')}
          value={rasterToolSettings.fillColor}
          palette={EDITOR_TOOL_SHAPE_STROKE_PALETTE}
          onChange={(fillColor) => state.updateRasterToolSettings({ fillColor })}
        />
      </CompactCommandField>
    ),
  };
}
