import type {
  StepBadgePreset,
  StepBadgeTemplateSettings,
} from '@sniptale/runtime-contracts/highlighter/step-badge';
import { ContentPopoverSection } from '@sniptale/ui/content-popover-adapter';
import { translate, useAppLocale } from '../../../platform/i18n';
import { getStepBadgePresetDisplayName } from '../../../features/highlighter/step-badge-presets/display-name';
import { TemplateSaveSettings } from '../../../ui/highlighter-preset-editor/template-save-settings';

export function StepBadgeSaveSection(props: {
  embedded?: boolean;
  onCreate: (
    name: string,
    settings: StepBadgeTemplateSettings
  ) => Promise<{ id?: string; outcome: string }>;
  onFloatingInteractionChange?: (open: boolean) => void;
  onCreated?: (templateId: string) => void;
  onUpdate: (
    preset: StepBadgePreset,
    settings: StepBadgeTemplateSettings
  ) => Promise<{ outcome: string }>;
  presets: StepBadgePreset[];
  settings: StepBadgeTemplateSettings;
}) {
  const locale = useAppLocale();
  const content = (
    <TemplateSaveSettings
      createActionLabel={translate('content.stepBadge.createTemplate')}
      createLabel={translate('content.stepBadge.saveAsTemplate')}
      duplicateNameErrorLabel={translate('content.stepBadge.templateNameExists')}
      nameLabel={translate('content.stepBadge.templateName')}
      onCreate={(name) =>
        props.onCreate(name, props.settings).then((result) => {
          if (result.outcome !== 'applied') return false;
          if (result.id) props.onCreated?.(result.id);
          return true;
        })
      }
      onOverwrite={(templateId) => {
        const template = props.presets.find((item) => item.id === templateId);
        return template
          ? props.onUpdate(template, props.settings).then((result) => {
              if (result.outcome !== 'applied') return false;
              props.onCreated?.(templateId);
              return true;
            })
          : Promise.resolve(false);
      }}
      options={props.presets.map((preset) => ({
        label: getStepBadgePresetDisplayName(preset, locale),
        value: preset.id,
      }))}
      overwriteActionLabel={translate('content.stepBadge.overwriteTemplate')}
      overwriteLabel={translate('content.stepBadge.updateTemplate')}
      selectLabel={translate('content.stepBadge.selectTemplate')}
      {...(props.onFloatingInteractionChange
        ? { onFloatingInteractionChange: props.onFloatingInteractionChange }
        : {})}
    />
  );
  return props.embedded ? content : <ContentPopoverSection>{content}</ContentPopoverSection>;
}
