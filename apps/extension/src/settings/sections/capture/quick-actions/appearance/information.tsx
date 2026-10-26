import type { QuickActionAppearance } from '../../../../../contracts/quick-action-appearance';
import {
  CheckboxField,
  ColorField,
  NumericRow,
  SelectField,
  TextField,
  ToggleField,
} from '../../../../../ui/compact-inspector-controls';
import { translate } from '../../../../../platform/i18n';

export function QuickActionInformationSettings(props: {
  value: QuickActionAppearance;
  onChange(value: QuickActionAppearance): void;
}) {
  const info = props.value.information;
  const update = (patch: Partial<QuickActionAppearance['information']>) =>
    props.onChange({ ...props.value, information: { ...info, ...patch } });
  return (
    <div className="space-y-3">
      <ToggleField
        label={translate('settings.quickActions.appearanceInformationEnabled')}
        value={info.enabled}
        onChange={(enabled) => update({ enabled })}
      />
      {info.enabled ? (
        <>
          <SelectField
            label={translate('settings.quickActions.appearancePosition')}
            value={info.position}
            options={[
              { value: 'above', label: translate('settings.quickActions.appearanceAbove') },
              { value: 'below', label: translate('settings.quickActions.appearanceBelow') },
            ]}
            onChange={(position) => update({ position })}
          />
          <CheckboxField
            label={translate('settings.quickActions.appearancePageTitle')}
            value={info.title}
            onChange={(title) => update({ title })}
          />
          <CheckboxField
            label={translate('settings.quickActions.appearancePageAddress')}
            value={info.url}
            onChange={(url) => update({ url })}
          />
          <CheckboxField
            label={translate('settings.quickActions.appearanceDate')}
            value={info.date}
            onChange={(date) => update({ date })}
          />
          <CheckboxField
            label={translate('settings.quickActions.appearanceDimensions')}
            value={info.dimensions}
            onChange={(dimensions) => update({ dimensions })}
          />
          <TextField
            label={translate('settings.quickActions.appearanceCaptionText')}
            value={info.text}
            maxLength={2048}
            onChange={(event) => update({ text: event.target.value })}
          />
          <ColorField
            title={translate('settings.quickActions.appearanceCaptionColor')}
            label={translate('settings.quickActions.appearanceCaptionColor')}
            value={info.color}
            onChange={(color) => update({ color })}
          />
          <NumericRow
            label={translate('settings.quickActions.appearanceCaptionSize')}
            value={info.size}
            min={10}
            max={48}
            unit="px"
            onPreviewValue={(size) => update({ size })}
            onCommitValue={(size) => update({ size })}
          />
          <p className="text-xs text-[var(--sniptale-color-text-secondary)]">
            {translate('settings.quickActions.appearanceSourcesHint')}
          </p>
        </>
      ) : null}
    </div>
  );
}
