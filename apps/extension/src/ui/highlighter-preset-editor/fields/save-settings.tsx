import type { BorderPreset } from '../../../features/highlighter/contracts';
import type { ReactNode } from 'react';
import { getBorderPresetDisplayName } from '../../../features/highlighter/presets/display-name';
import { translate, useAppLocale } from '../../../platform/i18n';
import { TemplateSaveSettings } from '../template-save-settings';

export function BorderManualSaveSettings(props: {
  disabled?: boolean;
  isSaving: boolean;
  leadingContent?: ReactNode;
  onFloatingInteractionChange?: (open: boolean) => void;
  onCreated?: () => void;
  onOverwritten?: (templateId: string) => void;
  onSave: (input: { name?: string; overwrite?: BorderPreset }) => Promise<boolean>;
  presets: BorderPreset[];
}) {
  const locale = useAppLocale();
  const options = props.presets.map((preset) => ({
    label: getBorderPresetDisplayName(preset, locale),
    value: preset.id,
  }));
  return (
    <TemplateSaveSettings
      createActionLabel={translate('content.overlayControls.frameStyleCreate')}
      createLabel={translate('content.overlayControls.frameStyleSaveNew')}
      createdStatusLabel={translate('content.overlayControls.frameStyleCreated')}
      duplicateNameErrorLabel={translate('content.overlayControls.frameStyleTemplateNameExists')}
      isSaving={props.isSaving}
      {...(props.leadingContent ? { leadingContent: props.leadingContent } : {})}
      nameLabel={translate('content.overlayControls.frameStylePresetName')}
      onCreate={(name) => props.onSave({ name })}
      {...(props.onCreated ? { onCreated: props.onCreated } : {})}
      onOverwrite={(presetId) =>
        props.onSave({ overwrite: props.presets.find((preset) => preset.id === presetId)! })
      }
      {...(props.onOverwritten ? { onOverwritten: props.onOverwritten } : {})}
      options={options}
      overwriteActionLabel={translate('content.overlayControls.frameStyleOverwriteAction')}
      overwriteLabel={translate('content.overlayControls.frameStyleOverwrite')}
      overwrittenStatusLabel={translate('content.overlayControls.frameStyleOverwritten')}
      selectLabel={translate('content.overlayControls.frameStyleSelectPreset')}
      {...(props.disabled === undefined ? {} : { disabled: props.disabled })}
      {...(props.onFloatingInteractionChange
        ? { onFloatingInteractionChange: props.onFloatingInteractionChange }
        : {})}
    />
  );
}
