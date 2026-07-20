import { translate } from '../../../../../platform/i18n';
import { isTextClip } from '../../../../../features/video/project/timeline';
import type { WorkspaceSidebarProps } from '../../contracts/props';
import { ColorField } from '../shared/controls';
import { OptionButtonsField } from '../shared/option-buttons';
import { SliderField } from '../shared/sliders';
import { TextTemplateUpgradeFields } from './text-upgrade';

function TextStyleFields(props: {
  clipId: string;
  disabled: boolean;
  style: Extract<NonNullable<WorkspaceSidebarProps['selectedClip']>, { type: 'TEXT' }>['style'];
  onUpdateTextStyle: WorkspaceSidebarProps['onUpdateTextStyle'];
  recentColors?: WorkspaceSidebarProps['recentColors'];
  onRememberRecentColor?: WorkspaceSidebarProps['onRememberRecentColor'];
}) {
  return (
    <div className="space-y-3">
      <TextTypographyFields {...props} />
      <TextColorFields {...props} />
    </div>
  );
}

function TextTypographyFields(props: Parameters<typeof TextStyleFields>[0]) {
  return (
    <>
      <TextStyleSlider
        {...props}
        field="fontSize"
        labelKey="videoEditor.sidebar.textSizeLabel"
        max={160}
        min={10}
      />
      <TextStyleSlider
        {...props}
        field="fontWeight"
        labelKey="videoEditor.sidebar.textWeightLabel"
        max={900}
        min={100}
        step={10}
      />
      <TextStyleSlider
        {...props}
        field="lineHeight"
        labelKey="videoEditor.sidebar.textLineHeightLabel"
        max={2.4}
        min={0.8}
        step={0.05}
        formatValue={(value) => `${Math.round(value * 100)}%`}
      />
      <TextStyleSlider
        {...props}
        field="padding"
        labelKey="videoEditor.sidebar.textPaddingLabel"
        max={80}
        min={0}
      />
      <OptionButtonsField
        label={translate('videoEditor.sidebar.textAlignLabel')}
        disabled={props.disabled}
        value={props.style.textAlign}
        onChange={(textAlign) => props.onUpdateTextStyle(props.clipId, { textAlign })}
        options={[
          { label: translate('videoEditor.sidebar.alignLeftLabel'), value: 'left' },
          { label: translate('videoEditor.sidebar.alignCenterLabel'), value: 'center' },
          { label: translate('videoEditor.sidebar.alignRightLabel'), value: 'right' },
        ]}
      />
    </>
  );
}

function TextColorFields(props: Parameters<typeof TextStyleFields>[0]) {
  return (
    <>
      <TextColorField {...props} field="color" labelKey="videoEditor.sidebar.textColorLabel" />
      <TextColorField
        {...props}
        field="backgroundColor"
        labelKey="videoEditor.sidebar.textBackgroundLabel"
      />
      <TextColorField
        {...props}
        field="borderColor"
        labelKey="videoEditor.sidebar.borderColorLabel"
      />
      <TextStyleSlider
        {...props}
        field="borderWidth"
        labelKey="videoEditor.sidebar.borderWidthLabel"
        max={32}
        min={0}
      />
    </>
  );
}

function TextColorField(
  props: Parameters<typeof TextStyleFields>[0] & {
    field: 'backgroundColor' | 'borderColor' | 'color';
    labelKey: Parameters<typeof translate>[0];
  }
) {
  return (
    <ColorField
      label={translate(props.labelKey)}
      disabled={props.disabled}
      recentColors={props.recentColors}
      onRememberRecentColor={props.onRememberRecentColor}
      value={props.style[props.field]}
      onChange={(value) => props.onUpdateTextStyle(props.clipId, { [props.field]: value })}
    />
  );
}

function TextStyleSlider(
  props: Parameters<typeof TextStyleFields>[0] & {
    field: 'borderWidth' | 'fontSize' | 'fontWeight' | 'lineHeight' | 'padding';
    formatValue?: (value: number) => string;
    labelKey: Parameters<typeof translate>[0];
    max: number;
    min: number;
    step?: number;
  }
) {
  return (
    <SliderField
      label={translate(props.labelKey)}
      disabled={props.disabled}
      value={props.style[props.field]}
      min={props.min}
      max={props.max}
      step={props.step ?? 1}
      formatValue={props.formatValue ?? ((value) => `${Math.round(value)} px`)}
      onChange={(value) => props.onUpdateTextStyle(props.clipId, { [props.field]: value })}
    />
  );
}

export function renderTextStyleFields(
  selectedClip: WorkspaceSidebarProps['selectedClip'],
  selectedTrackLocked: boolean,
  onUpdateTextStyle: WorkspaceSidebarProps['onUpdateTextStyle'],
  recentColors?: WorkspaceSidebarProps['recentColors'],
  onRememberRecentColor?: WorkspaceSidebarProps['onRememberRecentColor'],
  onConvertTextClipToAnnotation?: WorkspaceSidebarProps['onConvertTextClipToAnnotation']
) {
  if (!selectedClip || !isTextClip(selectedClip)) {
    return null;
  }

  return (
    <div className="space-y-3">
      <TextStyleFields
        clipId={selectedClip.id}
        disabled={selectedTrackLocked}
        style={selectedClip.style}
        recentColors={recentColors}
        onRememberRecentColor={onRememberRecentColor}
        onUpdateTextStyle={onUpdateTextStyle}
      />
      {onConvertTextClipToAnnotation ? (
        <TextTemplateUpgradeFields
          clipId={selectedClip.id}
          disabled={selectedTrackLocked}
          onConvertTextClipToAnnotation={onConvertTextClipToAnnotation}
        />
      ) : null}
    </div>
  );
}
