import { translate } from '../../../../platform/i18n';
import { NumericRow, SelectField } from '../../../chrome/ui';
import { ToolColorSection } from '../color-section';
import { resolveInspectorGradientPatchState } from '../gradient-patch';
import { EditorGradientControls } from '../../gradient';
import { renderLineRoughFillSection } from './rough-fill';
import type { LineControlsProps, LineSettings } from './types';

function renderLineFillModeSelector(props: LineControlsProps, settings: LineSettings) {
  return (
    <SelectField
      label={translate('editor.compact.lineFill')}
      value={settings.fillMode}
      onChange={(fillMode) => props.applyLinePatch({ fillMode })}
      options={props.lineFillModeOptions}
    />
  );
}

function renderLineFillColorSection(props: LineControlsProps, settings: LineSettings) {
  return (
    <ToolColorSection
      titleKey="editor.compact.fillColor"
      value={settings.fillColor}
      recentColors={props.recentColors}
      palette={props.shapeFillPalette}
      applyPatch={props.applyLinePatch}
      createPatch={(fillColor: string) => ({ fillColor })}
      previewColor={props.previewColor}
      updateColor={props.updateColor}
    />
  );
}

function renderLineGradientSection(props: LineControlsProps, settings: LineSettings) {
  const { createPatch, stops } = resolveInspectorGradientPatchState(settings);

  return (
    <EditorGradientControls
      angle={settings.gradientAngle}
      stops={stops}
      palette={props.shapeFillPalette}
      recentColors={props.recentColors}
      onStopsChange={(gradientStops) => props.applyLinePatch(createPatch(gradientStops))}
      onPreviewStopsChange={(gradientStops) => props.previewLinePatch(createPatch(gradientStops))}
      onAngleChange={(gradientAngle) => props.previewLinePatch({ gradientAngle })}
      onAngleCommit={props.commitPendingSelectionSettings}
    />
  );
}

function renderLineFillOpacitySection(props: LineControlsProps, settings: LineSettings) {
  const fillOpacity = Math.round(settings.fillOpacity * 100);

  return (
    <NumericRow
      label={translate('editor.compact.fillOpacity')}
      value={fillOpacity}
      unit="%"
      min={0}
      max={100}
      onPreviewValue={(value) => props.previewLinePatch({ fillOpacity: value / 100 })}
      onCommitValue={(value) => {
        props.previewLinePatch({ fillOpacity: value / 100 });
        props.commitPendingSelectionSettings();
      }}
      scrub={{ min: 0, max: 100 }}
    />
  );
}

export function renderLineFillSection(props: LineControlsProps, settings: LineSettings) {
  return (
    <div className="space-y-3">
      {renderLineFillModeSelector(props, settings)}
      {settings.fillMode === 'color' ? renderLineFillColorSection(props, settings) : null}
      {settings.fillMode === 'gradient' ? renderLineGradientSection(props, settings) : null}
      {settings.fillMode === 'rough' ? renderLineRoughFillSection(props, settings) : null}
      {settings.fillMode !== 'none' && settings.fillMode !== 'rough'
        ? renderLineFillOpacitySection(props, settings)
        : null}
    </div>
  );
}
