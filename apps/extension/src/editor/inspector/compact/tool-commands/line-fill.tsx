import { translate } from '../../../../platform/i18n';
import {
  createEditorGradientFallbackStops,
  normalizeEditorGradientStops,
} from '../../../../features/editor/document/gradient';
import { CompactCommandField, type CompactCommand } from '..';
import { ToolColorSection } from '../../tools/color-section';
import { EditorGradientControls } from '../../gradient';
import { TablerColorIcon } from '../color-icon';
import { createGradientEditorBackground } from '../../gradient';
import { RoughFillContent } from './line-rough-fill';
import { LineFillModeSelector } from './line-options';
import { LineRange } from './line-range';
import { resolveInspectorGradientPatchState } from '../../tools/gradient-patch';
import type { LineCommandParams, LineSettings } from './line-types';

function lineOptionLabel<TValue extends string>(
  options: readonly { label: string; value: TValue }[],
  value: TValue
) {
  return options.find((option) => option.value === value)?.label ?? value;
}

function FillOpacityControl(props: { params: LineCommandParams; settings: LineSettings }) {
  const percent = Math.round(props.settings.fillOpacity * 100);

  return (
    <LineRange
      label={translate('editor.compact.fillOpacity')}
      min={0}
      max={100}
      value={percent}
      onChange={(fillOpacity) => props.params.previewLinePatch({ fillOpacity: fillOpacity / 100 })}
      onValueCommit={props.params.commitPendingSelectionSettings}
    />
  );
}

function GradientFillContent(props: { params: LineCommandParams; settings: LineSettings }) {
  const { params, settings } = props;
  const { createPatch, stops } = resolveInspectorGradientPatchState(settings);

  return (
    <>
      <EditorGradientControls
        angle={settings.gradientAngle}
        stops={stops}
        palette={params.shapeFillPalette}
        recentColors={params.recentColors}
        onStopsChange={(gradientStops) => params.applyLinePatch(createPatch(gradientStops))}
        onPreviewStopsChange={(gradientStops) =>
          params.previewLinePatch(createPatch(gradientStops))
        }
        onAngleChange={(gradientAngle) => params.previewLinePatch({ gradientAngle })}
        onAngleCommit={params.commitPendingSelectionSettings}
      />
      <FillOpacityControl params={params} settings={settings} />
    </>
  );
}

function LineFillContent(props: { params: LineCommandParams; settings: LineSettings }) {
  const { params, settings } = props;

  return (
    <div className="space-y-3">
      <LineFillModeSelector
        ariaLabel={translate('editor.compact.lineFill')}
        value={settings.fillMode}
        onChange={(fillMode) => params.applyLinePatch({ fillMode })}
        options={params.lineFillModeOptions}
      />
      {settings.fillMode === 'color' ? (
        <>
          <ToolColorSection
            titleKey="editor.compact.fillColor"
            value={settings.fillColor}
            recentColors={params.recentColors}
            palette={params.shapeFillPalette}
            applyPatch={params.applyLinePatch}
            createPatch={(fillColor: string) => ({ fillColor })}
            previewColor={params.previewColor}
            updateColor={params.updateColor}
          />
          <FillOpacityControl params={params} settings={settings} />
        </>
      ) : null}
      {settings.fillMode === 'gradient' ? (
        <GradientFillContent params={params} settings={settings} />
      ) : null}
      {settings.fillMode === 'rough' ? (
        <RoughFillContent params={params} settings={settings} />
      ) : null}
    </div>
  );
}

export function buildLineFillCommand(
  params: LineCommandParams,
  settings: LineSettings
): CompactCommand {
  const label = translate('editor.compact.lineFill');
  const value = lineOptionLabel(params.lineFillModeOptions, settings.fillMode);
  const gradientStops = normalizeEditorGradientStops(
    settings.gradientStops,
    createEditorGradientFallbackStops(settings.gradientFrom, settings.gradientTo)
  );

  return {
    id: 'line-fill',
    icon: 'color',
    title: label,
    trigger:
      settings.fillMode === 'gradient' ? (
        <span
          className="block h-5 w-5 rounded-full border border-[color:var(--sniptale-color-border-soft)]"
          style={{ backgroundImage: createGradientEditorBackground(gradientStops) }}
        />
      ) : (
        <TablerColorIcon
          color={settings.fillMode === 'none' ? settings.color : settings.fillColor}
          icon={
            settings.fillMode === 'none' || settings.fillOpacity <= 0
              ? 'tabler:bucket-off'
              : 'tabler:bucket'
          }
          opacity={
            settings.fillMode === 'none' || settings.fillOpacity <= 0 ? 0.65 : settings.fillOpacity
          }
        />
      ),
    value,
    content: (
      <CompactCommandField label={label} value={value}>
        <LineFillContent params={params} settings={settings} />
      </CompactCommandField>
    ),
  };
}
