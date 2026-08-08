import { Settings2 } from 'lucide-react';

import type { PromptTemplate } from '../../../../../contracts/settings';
import { translate } from '../../../../../platform/i18n';
import { ProductSelect } from '@sniptale/ui/product-form-controls';
import { openAIModalSettings } from './settings-navigation';

function getTemplatePreview(content: string): string {
  const normalized = content.replace(/\s+/g, ' ').trim();
  return normalized.length > 240 ? `${normalized.slice(0, 237)}…` : normalized;
}

export function AIModalPromptTemplatePicker(props: {
  disabled: boolean;
  isLoading: boolean;
  onSelectTemplate: (template: PromptTemplate) => Promise<void>;
  templates: PromptTemplate[];
}) {
  const enabledTemplates = props.templates.filter((template) => template.enabled !== false);

  return (
    <div className="sniptale-ai-modal-template-picker">
      <ProductSelect
        aria-label={translate('aiModal.templatesLabel')}
        containerClassName="sniptale-ai-modal-template-select"
        controlSize="sm"
        dataUi="ai-modal.template-picker"
        disabled={props.disabled || props.isLoading || enabledTemplates.length === 0}
        menuClassName="sniptale-ai-modal-template-menu"
        menuScrollable
        onChange={(templateId) => {
          const template = enabledTemplates.find((candidate) => candidate.id === templateId);
          if (template) void props.onSelectTemplate(template);
        }}
        options={enabledTemplates.map((template) => ({
          description: getTemplatePreview(template.content),
          label: template.name,
          value: template.id,
        }))}
        placeholder={
          props.isLoading
            ? translate('aiModal.templatesLoadingCompact')
            : translate('aiModal.chooseTemplate')
        }
        value=""
      />
      <button
        aria-label={translate('aiModal.openPromptTemplatesSettings')}
        className="sniptale-ai-modal-inline-settings"
        disabled={props.disabled}
        onClick={(event) => void openAIModalSettings({ section: 'ai-prompts' }, event.nativeEvent)}
        title={translate('aiModal.openPromptTemplatesSettings')}
        type="button"
      >
        <Settings2 aria-hidden="true" size={14} />
      </button>
    </div>
  );
}
