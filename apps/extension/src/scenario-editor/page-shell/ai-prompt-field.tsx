import { useState } from 'react';
import { Settings2 } from 'lucide-react';
import { ProductSelect } from '@sniptale/ui/product-form-controls';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { SCENARIO_EDITOR_AI_PAYLOAD_LIMITS } from '@sniptale/runtime-contracts/ai/payload-policy';
import { usePromptTemplates } from '../../features/prompt-templates/hooks/use-prompt-templates';
import { openSettingsPage } from '../../platform/navigation/extension-pages';
import type { Translate } from '../../platform/i18n';
import { GuideVoiceField } from './voice-field';

/** Reuses template lifecycle and field-bound dictation inside one compact instruction field. */
export function GuideAiPromptField({
  value,
  onChange,
  disabled,
  t,
}: {
  value: string;
  onChange(value: string): void;
  disabled: boolean;
  t: Translate;
}) {
  const templates = usePromptTemplates('scenario');
  const [navigationFailed, setNavigationFailed] = useState(false);
  const enabled = templates.templates.filter((template) => template.enabled !== false);
  return (
    <div className="guide-ai-prompt">
      <span>{t('scenario.editor.guideAiInstruction')}</span>
      <div className="guide-ai-prompt-input">
        <GuideVoiceField
          aria-label={t('scenario.editor.guideAiInstruction')}
          value={value}
          onValueChange={onChange}
          disabled={disabled}
          formControl
          rows={4}
          maxLength={SCENARIO_EDITOR_AI_PAYLOAD_LIMITS.maxInstructionChars}
        />
        <div className="guide-ai-prompt-templates">
          <ProductSelect
            aria-label={t('aiModal.templatesLabel')}
            controlSize="sm"
            menuScrollable
            value=""
            disabled={disabled || templates.isLoading || templates.isMutating || !enabled.length}
            placeholder={t(
              templates.isLoading ? 'aiModal.templatesLoadingCompact' : 'aiModal.chooseTemplate'
            )}
            options={enabled.map((template) => ({
              value: template.id,
              label: template.name,
              description: template.content.slice(0, 240),
            }))}
            onChange={(id) => {
              const template = enabled.find((item) => item.id === id);
              if (template) {
                onChange(
                  template.content.slice(0, SCENARIO_EDITOR_AI_PAYLOAD_LIMITS.maxInstructionChars)
                );
                void templates.selectTemplate(template).catch(() => {});
              }
            }}
          />
          <ContentToolbarButton
            disabled={disabled}
            title={t('aiModal.openPromptTemplatesSettings')}
            onClick={() => {
              setNavigationFailed(false);
              void openSettingsPage({
                route: { section: 'ai-prompts', view: 'scenario-templates' },
              }).catch(() => setNavigationFailed(true));
            }}
          >
            <Settings2 size={14} />
          </ContentToolbarButton>
        </div>
      </div>
      {templates.error && <p role="alert">{templates.error}</p>}
      {navigationFailed && <p role="alert">{t('aiModal.openSettingsFailed')}</p>}
    </div>
  );
}
