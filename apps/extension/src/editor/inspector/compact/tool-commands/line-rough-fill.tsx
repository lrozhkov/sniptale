import { translate } from '../../../../platform/i18n';
import { SelectField } from '../../../chrome/ui';
import { ToolColorSection } from '../../tools/color-section';
import { LineRange } from './line-range';
import type { LineCommandParams, LineSettings } from './line-types';

function RoughRange(props: {
  field: keyof Pick<
    LineSettings,
    'roughFillAngle' | 'roughFillBowing' | 'roughFillGap' | 'roughFillRoughness' | 'roughFillWeight'
  >;
  label: string;
  max: number;
  min: number;
  params: LineCommandParams;
  step?: number;
  unit?: string;
  value: number;
}) {
  return (
    <LineRange
      label={props.label}
      min={props.min}
      max={props.max}
      {...(props.step === undefined ? {} : { step: props.step })}
      value={props.value}
      onChange={(next) => props.params.previewLinePatch({ [props.field]: next })}
      onValueCommit={props.params.commitPendingSelectionSettings}
    />
  );
}

function RoughFillTextureRanges(props: { params: LineCommandParams; settings: LineSettings }) {
  const { params, settings } = props;

  return (
    <>
      <RoughRange
        field="roughFillWeight"
        label={translate('editor.compact.lineWidth')}
        min={0.1}
        max={8}
        step={0.1}
        unit="px"
        value={settings.roughFillWeight}
        params={params}
      />
      <RoughRange
        field="roughFillRoughness"
        label={translate('editor.compact.roughness')}
        min={0}
        max={4}
        step={0.1}
        value={settings.roughFillRoughness}
        params={params}
      />
      <RoughRange
        field="roughFillBowing"
        label={translate('editor.compact.bowing')}
        min={0}
        max={4}
        step={0.1}
        value={settings.roughFillBowing}
        params={params}
      />
    </>
  );
}

function RoughFillSpacingRanges(props: { params: LineCommandParams; settings: LineSettings }) {
  const { params, settings } = props;
  const roughOpacity = Math.round(settings.roughFillOpacity * 100);

  return (
    <>
      <RoughRange
        field="roughFillGap"
        label={translate('editor.compact.roughFillGap')}
        min={2}
        max={28}
        unit="px"
        value={settings.roughFillGap}
        params={params}
      />
      <RoughRange
        field="roughFillAngle"
        label={translate('editor.compact.roughFillAngle')}
        min={-90}
        max={90}
        unit="°"
        value={settings.roughFillAngle}
        params={params}
      />
      <LineRange
        label={translate('editor.compact.fillOpacity')}
        min={0}
        max={100}
        value={roughOpacity}
        onChange={(roughFillOpacity) =>
          params.previewLinePatch({ roughFillOpacity: roughFillOpacity / 100 })
        }
        onValueCommit={params.commitPendingSelectionSettings}
      />
    </>
  );
}

function RoughFillBaseControls(props: { params: LineCommandParams; settings: LineSettings }) {
  const { params, settings } = props;

  return (
    <>
      <ToolColorSection
        titleKey="editor.compact.fillColor"
        value={settings.roughFillColor}
        recentColors={params.recentColors}
        palette={params.shapeFillPalette}
        applyPatch={params.applyLinePatch}
        createPatch={(roughFillColor: string) => ({ roughFillColor })}
        previewColor={params.previewColor}
        updateColor={params.updateColor}
      />
      <SelectField
        label={translate('editor.compact.roughFillStyle')}
        options={params.lineRoughFillStyleOptions}
        value={settings.roughFillStyle}
        onChange={(roughFillStyle) => params.applyLinePatch({ roughFillStyle })}
      />
    </>
  );
}

export function RoughFillContent(props: { params: LineCommandParams; settings: LineSettings }) {
  return (
    <>
      <RoughFillBaseControls params={props.params} settings={props.settings} />
      <RoughFillTextureRanges params={props.params} settings={props.settings} />
      <RoughFillSpacingRanges params={props.params} settings={props.settings} />
    </>
  );
}
