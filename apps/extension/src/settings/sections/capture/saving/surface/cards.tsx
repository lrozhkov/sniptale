import { ProductSelect } from '@sniptale/ui/product-form-controls';
import type { CaptureActionType } from '../../../../../contracts/settings';
import { translate } from '../../../../../platform/i18n';
import { SettingsControlRow, settingsMetaLabelClassName } from '../../../../section-surface';

function SettingsSelectRow<T extends string>(props: {
  disabled: boolean;
  description?: string;
  label: string;
  onChange: (value: T) => Promise<void>;
  options: { value: T; label: string }[];
  value: T;
}) {
  return (
    <SettingsControlRow label={props.label} description={props.description}>
      <ProductSelect<T>
        aria-label={props.label}
        value={props.value}
        onChange={props.onChange}
        options={props.options}
        disabled={props.disabled}
      />
    </SettingsControlRow>
  );
}

export function SaveSettingsRows(props: {
  captureAction: CaptureActionType;
  captureActionOptions: { value: CaptureActionType; label: string }[];
  defaultExportPresetId: string | null;
  defaultImagePresetId: string | null;
  defaultVideoPresetId: string | null;
  isLoading: boolean;
  onCaptureActionChange: (value: CaptureActionType) => Promise<void>;
  onDefaultExportChange: (value: string) => Promise<void>;
  onDefaultImageChange: (value: string) => Promise<void>;
  onDefaultVideoChange: (value: string) => Promise<void>;
  presetOptions: { value: string; label: string }[];
}) {
  return (
    <div className="space-y-6">
      <section className="space-y-1">
        <h2 className={settingsMetaLabelClassName}>
          {translate('savePresets.section.afterCaptureTitle')}
        </h2>
        <SettingsSelectRow
          disabled={props.isLoading}
          description={translate('savePresets.section.captureActionDescription')}
          label={translate('savePresets.section.captureActionLabel')}
          onChange={props.onCaptureActionChange}
          options={props.captureActionOptions}
          value={props.captureAction}
        />
      </section>
      <section className="space-y-1">
        <div>
          <h2 className={settingsMetaLabelClassName}>
            {translate('savePresets.section.downloadsTitle')}
          </h2>
          <p className="mt-1 text-xs leading-5 text-[var(--sniptale-color-text-muted)]">
            {translate('savePresets.section.downloadsDescription')}
          </p>
        </div>
        <SettingsSelectRow
          disabled={props.isLoading}
          label={translate('savePresets.section.imagePresetLabel')}
          onChange={props.onDefaultImageChange}
          options={props.presetOptions}
          value={props.defaultImagePresetId ?? ''}
        />
        <SettingsSelectRow
          disabled={props.isLoading}
          label={translate('savePresets.section.videoPresetLabel')}
          onChange={props.onDefaultVideoChange}
          options={props.presetOptions}
          value={props.defaultVideoPresetId ?? ''}
        />
        <SettingsSelectRow
          disabled={props.isLoading}
          label={translate('savePresets.section.exportPresetLabel')}
          onChange={props.onDefaultExportChange}
          options={props.presetOptions}
          value={props.defaultExportPresetId ?? ''}
        />
      </section>
    </div>
  );
}
