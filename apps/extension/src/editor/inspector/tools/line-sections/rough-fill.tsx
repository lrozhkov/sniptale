import { translate } from '../../../../platform/i18n';
import { NumericRow, SelectField } from '../../../chrome/ui';
import { ToolColorSection } from '../color-section';
import type { LineControlsProps, LineSettings } from './types';

function renderLineRoughNumericRow(
  props: LineControlsProps,
  options: {
    label: string;
    max: number;
    min: number;
    onChange: (value: number) => void;
    precision?: number;
    step?: number;
    unit?: 'px' | '%' | 'deg' | '';
    value: number;
  }
) {
  return (
    <NumericRow
      label={options.label}
      value={options.value}
      unit={options.unit ?? ''}
      min={options.min}
      max={options.max}
      step={options.step}
      precision={options.precision}
      onPreviewValue={options.onChange}
      onCommitValue={(value) => {
        options.onChange(value);
        props.commitPendingSelectionSettings();
      }}
      scrub={{ min: options.min, max: options.max, step: options.step }}
    />
  );
}

export function renderLineRoughFillSection(props: LineControlsProps, settings: LineSettings) {
  return (
    <div className="space-y-2">
      {renderLineRoughFillColorSection(props, settings)}
      {renderLineRoughFillStyleSection(props, settings)}
      {renderLineRoughFillWeightSection(props, settings)}
      {renderLineRoughFillRoughnessSection(props, settings)}
      {renderLineRoughFillBowingSection(props, settings)}
      {renderLineRoughFillOpacitySection(props, settings)}
      {renderLineRoughFillGapSection(props, settings)}
      {renderLineRoughFillAngleSection(props, settings)}
    </div>
  );
}

function renderLineRoughFillColorSection(props: LineControlsProps, settings: LineSettings) {
  return (
    <ToolColorSection
      titleKey="editor.compact.fillColor"
      value={settings.roughFillColor}
      recentColors={props.recentColors}
      palette={props.shapeFillPalette}
      applyPatch={props.applyLinePatch}
      createPatch={(roughFillColor: string) => ({ roughFillColor })}
      previewColor={props.previewColor}
      updateColor={props.updateColor}
    />
  );
}

function renderLineRoughFillStyleSection(props: LineControlsProps, settings: LineSettings) {
  const label = translate('editor.compact.roughFillStyle');
  return (
    <SelectField
      label={label}
      options={props.lineRoughFillStyleOptions}
      value={settings.roughFillStyle}
      onChange={(roughFillStyle) => props.applyLinePatch({ roughFillStyle })}
    />
  );
}

function renderLineRoughFillWeightSection(props: LineControlsProps, settings: LineSettings) {
  return renderLineRoughNumericRow(props, {
    label: translate('editor.compact.lineWidth'),
    max: 8,
    min: 0.1,
    onChange: (roughFillWeight) => props.previewLinePatch({ roughFillWeight }),
    precision: 1,
    step: 0.1,
    unit: 'px',
    value: settings.roughFillWeight,
  });
}

function renderLineRoughFillRoughnessSection(props: LineControlsProps, settings: LineSettings) {
  return renderLineRoughNumericRow(props, {
    label: translate('editor.compact.roughness'),
    max: 4,
    min: 0,
    onChange: (roughFillRoughness) => props.previewLinePatch({ roughFillRoughness }),
    precision: 1,
    step: 0.1,
    value: settings.roughFillRoughness,
  });
}

function renderLineRoughFillBowingSection(props: LineControlsProps, settings: LineSettings) {
  return renderLineRoughNumericRow(props, {
    label: translate('editor.compact.bowing'),
    max: 4,
    min: 0,
    onChange: (roughFillBowing) => props.previewLinePatch({ roughFillBowing }),
    precision: 1,
    step: 0.1,
    value: settings.roughFillBowing,
  });
}

function renderLineRoughFillOpacitySection(props: LineControlsProps, settings: LineSettings) {
  const roughFillOpacity = Math.round(settings.roughFillOpacity * 100);
  return renderLineRoughNumericRow(props, {
    label: translate('editor.compact.fillOpacity'),
    max: 100,
    min: 0,
    onChange: (roughFillOpacity) =>
      props.previewLinePatch({ roughFillOpacity: roughFillOpacity / 100 }),
    unit: '%',
    value: roughFillOpacity,
  });
}

function renderLineRoughFillGapSection(props: LineControlsProps, settings: LineSettings) {
  return renderLineRoughNumericRow(props, {
    label: translate('editor.compact.roughFillGap'),
    max: 28,
    min: 2,
    onChange: (roughFillGap) => props.previewLinePatch({ roughFillGap }),
    unit: 'px',
    value: settings.roughFillGap,
  });
}

function renderLineRoughFillAngleSection(props: LineControlsProps, settings: LineSettings) {
  return renderLineRoughNumericRow(props, {
    label: translate('editor.compact.roughFillAngle'),
    max: 90,
    min: -90,
    onChange: (roughFillAngle) => props.previewLinePatch({ roughFillAngle }),
    unit: 'deg',
    value: settings.roughFillAngle,
  });
}
