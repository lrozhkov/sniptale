import { translate } from '../../../../platform/i18n';
import { ProductSelect } from '@sniptale/ui/product-form-controls';
import type { CaptureActionType } from '../../../../contracts/settings';
import {
  settingsAddButtonClassName,
  settingsCardClassName,
  SettingsSwitch,
} from '../../../section-surface/panel-controls';
import { settingsMetaLabelClassName, SettingsSectionHeader } from '../../../section-surface';

export const addButtonClassName = settingsAddButtonClassName;

export function SavePresetsHeader() {
  return (
    <SettingsSectionHeader
      description={translate('savePresets.section.subtitle')}
      kicker={translate('settings.navigation.saves')}
    />
  );
}

export function CaptureActionCard(props: {
  captureAction: CaptureActionType;
  captureActionOptions: { value: CaptureActionType; label: string }[];
  isLoading: boolean;
  onChange: (value: CaptureActionType) => Promise<void>;
}) {
  return (
    <div className={settingsCardClassName}>
      <label className="mb-2 block text-sm font-medium text-[var(--sniptale-color-text-secondary)]">
        {translate('savePresets.section.captureActionLabel')}
      </label>
      <ProductSelect<CaptureActionType>
        value={props.captureAction}
        onChange={props.onChange}
        options={props.captureActionOptions}
        disabled={props.isLoading}
      />
    </div>
  );
}

export function GalleryToggleCard(props: { enabled: boolean; onToggle: () => Promise<void> }) {
  return (
    <div className={settingsCardClassName}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <label className="block text-sm font-medium text-[var(--sniptale-color-text-secondary)]">
            {translate('savePresets.section.saveToGalleryLabel')}
          </label>
          <p className="mt-1 text-xs leading-5 text-[var(--sniptale-color-text-dim)]">
            {translate('savePresets.section.saveToGalleryDescription')}
          </p>
        </div>
        <SettingsSwitch
          checked={props.enabled}
          onClick={props.onToggle}
          title={
            props.enabled
              ? translate('savePresets.section.galleryToggleOnTitle')
              : translate('savePresets.section.galleryToggleOffTitle')
          }
        />
      </div>
    </div>
  );
}

function DefaultPresetSelect(props: {
  label: string;
  value: string | null;
  onChange: (value: string) => Promise<void>;
  options: { value: string; label: string }[];
  disabled: boolean;
}) {
  return (
    <div>
      <span className={`mb-1 block ${settingsMetaLabelClassName}`}>{props.label}</span>
      <ProductSelect
        value={props.value ?? ''}
        onChange={props.onChange}
        options={props.options}
        disabled={props.disabled}
      />
    </div>
  );
}

export function DefaultPresetsCard(props: {
  defaultExportPresetId: string | null;
  defaultImagePresetId: string | null;
  defaultVideoPresetId: string | null;
  isLoading: boolean;
  onDefaultExportChange: (value: string) => Promise<void>;
  onDefaultImageChange: (value: string) => Promise<void>;
  onDefaultVideoChange: (value: string) => Promise<void>;
  presetOptions: { value: string; label: string }[];
}) {
  return (
    <div className={`${settingsCardClassName} space-y-3`}>
      <label className="block text-sm font-medium text-[var(--sniptale-color-text-secondary)]">
        {translate('savePresets.section.defaultPresetsLabel')}
      </label>
      <DefaultPresetSelect
        label={translate('savePresets.section.imagePresetLabel')}
        value={props.defaultImagePresetId}
        onChange={props.onDefaultImageChange}
        options={props.presetOptions}
        disabled={props.isLoading}
      />
      <DefaultPresetSelect
        label={translate('savePresets.section.videoPresetLabel')}
        value={props.defaultVideoPresetId}
        onChange={props.onDefaultVideoChange}
        options={props.presetOptions}
        disabled={props.isLoading}
      />
      <DefaultPresetSelect
        label={translate('savePresets.section.exportPresetLabel')}
        value={props.defaultExportPresetId}
        onChange={props.onDefaultExportChange}
        options={props.presetOptions}
        disabled={props.isLoading}
      />
    </div>
  );
}
