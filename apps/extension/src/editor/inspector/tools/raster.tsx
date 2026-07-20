import {
  EDITOR_TOOL_SHAPE_FILL_PALETTE,
  EDITOR_TOOL_SHAPE_STROKE_PALETTE,
} from '../../../features/editor/document/constants';
import { translate } from '../../../platform/i18n';
import { useOptionalEditorController } from '../../application/controller-context';
import { EDITOR_RASTER_FILL_MODE } from '../../state/raster-tools';
import { useEditorStore } from '../../state/useEditorStore';
import { ColorField, SegmentedSelector, cx, type CompactSelectOption } from '../../chrome/ui';
import {
  createRasterBucketFillPatch,
  getRasterFillModeLabel,
  getRasterSelectionTargetLabel,
  rasterFillModeOptions,
  rasterSelectionModeOptions,
} from '../raster/options';
import { panelButtonClassName } from './helpers';
import { resolveInspectorGradientPatchState } from './gradient-patch';
import { renderInspectorNumericRow } from './numeric-row-section';
import { PanelSection } from './sections';
import { EditorGradientControls } from '../gradient';

function RasterSelectionStatus() {
  const controller = useOptionalEditorController();
  const rasterSelection = useEditorStore((state) => state.rasterSelection);

  if (!rasterSelection.hasSelection) {
    return null;
  }

  return (
    <PanelSection
      label={translate('editor.sidebar.rasterSelectionTarget')}
      value={getRasterSelectionTargetLabel(rasterSelection)}
    >
      <button
        type="button"
        className={cx(panelButtonClassName, 'w-full')}
        onClick={() => controller?.clearRasterSelection()}
      >
        {translate('editor.sidebar.rasterSelectionClear')}
      </button>
    </PanelSection>
  );
}

function RasterModePanel<T extends string>(props: {
  columns: 1 | 2 | 3;
  label: string;
  onChange: (value: T) => void;
  optionClassName?: string;
  options: readonly CompactSelectOption<T>[];
  value: T;
  valueLabel?: string;
}) {
  const panelValueProps = props.valueLabel === undefined ? {} : { value: props.valueLabel };
  const optionClassNameProps =
    props.optionClassName === undefined ? {} : { optionClassName: props.optionClassName };

  return (
    <PanelSection label={props.label} {...panelValueProps}>
      <SegmentedSelector
        ariaLabel={props.label}
        value={props.value}
        onChange={props.onChange}
        options={props.options}
        columns={props.columns}
        {...optionClassNameProps}
      />
    </PanelSection>
  );
}

function getRasterSelectionModeHeaderValue(value: string): string | undefined {
  return rasterSelectionModeOptions.some((option) => option.value === value) ? undefined : value;
}

function renderRasterNumericControl(options: {
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  scalePercent?: boolean;
  value: number;
  valueText: string;
}) {
  return renderInspectorNumericRow({
    ...options,
    commit: () => undefined,
    step: options.scalePercent ? 0.01 : 1,
    unit: options.valueText.endsWith('%') ? '%' : 'px',
  });
}

function renderRasterFillColorControls(
  settings: ReturnType<typeof useEditorStore.getState>['rasterToolSettings'],
  updateRasterToolSettings: ReturnType<typeof useEditorStore.getState>['updateRasterToolSettings']
) {
  if (settings.fillMode === EDITOR_RASTER_FILL_MODE.BUCKET) {
    return (
      <ColorField
        title={translate('editor.sidebar.rasterFillColor')}
        label={translate('editor.sidebar.rasterFillColor')}
        palette={EDITOR_TOOL_SHAPE_FILL_PALETTE}
        value={settings.fillColor}
        onChange={(fillColor) =>
          updateRasterToolSettings(createRasterBucketFillPatch(settings, fillColor))
        }
      />
    );
  }
  const { createPatch, stops } = resolveInspectorGradientPatchState(settings);

  return (
    <EditorGradientControls
      angle={0}
      stops={stops}
      palette={EDITOR_TOOL_SHAPE_STROKE_PALETTE}
      onStopsChange={(gradientStops) => updateRasterToolSettings(createPatch(gradientStops))}
      onAngleChange={() => undefined}
      showAngle={false}
    />
  );
}

export function RasterSelectionControlsSection() {
  const settings = useEditorStore((state) => state.rasterToolSettings);
  const updateRasterToolSettings = useEditorStore((state) => state.updateRasterToolSettings);
  const label = translate('editor.sidebar.rasterSelectionMode');
  const headerValue = getRasterSelectionModeHeaderValue(settings.selectionMode);

  return (
    <div className="space-y-3">
      <RasterModePanel
        label={label}
        value={settings.selectionMode}
        onChange={(selectionMode) => updateRasterToolSettings({ selectionMode })}
        options={rasterSelectionModeOptions}
        columns={1}
        optionClassName="!h-auto min-h-10 !whitespace-normal px-2 py-2 text-center text-[11px] leading-tight"
        {...(headerValue === undefined ? {} : { valueLabel: headerValue })}
      />
      <RasterSelectionStatus />
    </div>
  );
}

export function RasterEraserControlsSection() {
  const settings = useEditorStore((state) => state.rasterToolSettings);
  const updateRasterToolSettings = useEditorStore((state) => state.updateRasterToolSettings);

  return (
    <div className="space-y-3">
      {renderRasterNumericControl({
        label: translate('editor.sidebar.rasterEraserSize'),
        max: 120,
        min: 8,
        value: settings.eraserSize,
        valueText: `${settings.eraserSize}px`,
        onChange: (eraserSize) => updateRasterToolSettings({ eraserSize }),
      })}
      <RasterSelectionStatus />
    </div>
  );
}

export function RasterBrushControlsSection() {
  const settings = useEditorStore((state) => state.rasterToolSettings);
  const updateRasterToolSettings = useEditorStore((state) => state.updateRasterToolSettings);

  return (
    <div className="space-y-3">
      {renderRasterNumericControl({
        label: translate('editor.sidebar.rasterBrushSize'),
        max: 200,
        min: 1,
        value: settings.brushSize,
        valueText: `${settings.brushSize}px`,
        onChange: (brushSize) => updateRasterToolSettings({ brushSize }),
      })}
      <ColorField
        title={translate('editor.sidebar.rasterBrushColor')}
        label={translate('editor.sidebar.rasterBrushColor')}
        palette={EDITOR_TOOL_SHAPE_STROKE_PALETTE}
        value={settings.brushColor}
        onChange={(brushColor) => updateRasterToolSettings({ brushColor })}
      />
      {renderRasterNumericControl({
        label: translate('editor.sidebar.rasterBrushOpacity'),
        max: 1,
        min: 0,
        scalePercent: true,
        value: settings.brushOpacity,
        valueText: `${Math.round(settings.brushOpacity * 100)}%`,
        onChange: (brushOpacity) => updateRasterToolSettings({ brushOpacity }),
      })}
      {renderRasterNumericControl({
        label: translate('editor.sidebar.rasterBrushHardness'),
        max: 1,
        min: 0,
        scalePercent: true,
        value: settings.brushHardness,
        valueText: `${Math.round(settings.brushHardness * 100)}%`,
        onChange: (brushHardness) => updateRasterToolSettings({ brushHardness }),
      })}
      <RasterSelectionStatus />
    </div>
  );
}

export function RasterFillControlsSection() {
  const settings = useEditorStore((state) => state.rasterToolSettings);
  const updateRasterToolSettings = useEditorStore((state) => state.updateRasterToolSettings);
  const label = translate('editor.sidebar.rasterFillMode');

  return (
    <div className="space-y-3">
      <RasterModePanel
        label={label}
        value={settings.fillMode}
        valueLabel={getRasterFillModeLabel(settings.fillMode)}
        onChange={(fillMode) => updateRasterToolSettings({ fillMode })}
        options={rasterFillModeOptions}
        columns={2}
      />
      {renderRasterFillColorControls(settings, updateRasterToolSettings)}
      <RasterSelectionStatus />
    </div>
  );
}
