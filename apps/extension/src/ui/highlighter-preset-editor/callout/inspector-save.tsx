import type { CalloutPreset } from '@sniptale/runtime-contracts/highlighter/callout';
import { getCalloutPresetDisplayName } from '../../../features/highlighter/callout-presets/display-name';
import { translate, useAppLocale } from '../../../platform/i18n';
import { TemplateSaveSettings } from '../template-save-settings';

export type CalloutSaveSectionProps = {
  error: string | null;
  isSaving: boolean;
  onCreate: (name: string) => Promise<boolean>;
  onCreated?: () => void;
  onOverwrite: (presetId: string) => Promise<boolean>;
  onOverwritten?: (templateId: string) => void;
  presets: CalloutPreset[];
};

export function CalloutSaveSettings(props: CalloutSaveSectionProps) {
  const locale = useAppLocale();
  const options = props.presets.map((preset) => ({
    label: getCalloutPresetDisplayName(preset, locale),
    value: preset.id,
  }));
  return (
    <TemplateSaveSettings
      createActionLabel={translate('content.callout.createPresetAction')}
      createLabel={translate('content.callout.saveNewPreset')}
      createdStatusLabel={translate('content.callout.presetCreated')}
      duplicateNameErrorLabel={translate('content.callout.presetNameExists')}
      error={props.error}
      isSaving={props.isSaving}
      nameLabel={translate('content.callout.newPresetName')}
      onCreate={props.onCreate}
      {...(props.onCreated ? { onCreated: props.onCreated } : {})}
      onOverwrite={props.onOverwrite}
      {...(props.onOverwritten ? { onOverwritten: props.onOverwritten } : {})}
      options={options}
      overwriteActionLabel={translate('content.callout.overwritePresetAction')}
      overwriteLabel={translate('content.callout.overwritePreset')}
      overwrittenStatusLabel={translate('content.callout.presetOverwritten')}
      selectLabel={translate('content.callout.selectPreset')}
    />
  );
}
