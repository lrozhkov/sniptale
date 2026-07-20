import { translate } from '../../../../platform/i18n';
import { ProductTextarea } from '@sniptale/ui/product-form-controls';
import { settingsModalFieldSurfaceClassName } from '../../../section-surface/panel-controls';
import { aiProvidersSavePromptButtonClassName } from './constants';
import type { AiProvidersSectionState } from '../controller/types';

type AiProvidersPromptState = AiProvidersSectionState['prompts']['global'];

interface AiProvidersPromptCardProps {
  descriptionKey:
    | 'settings.aiProviders.globalPromptDescription'
    | 'settings.aiProviders.scenarioEditorPromptDescription';
  prompt: AiProvidersPromptState;
  saveButtonKey:
    | 'settings.aiProviders.globalPromptSaveButton'
    | 'settings.aiProviders.scenarioEditorPromptSaveButton';
}

export function AIProvidersPromptCard(props: AiProvidersPromptCardProps) {
  return (
    <>
      <p className="mb-3 text-sm leading-6 text-[var(--sniptale-color-text-secondary)]">
        {translate(props.descriptionKey)}
      </p>
      <div className={settingsModalFieldSurfaceClassName}>
        <div className="relative">
          <ProductTextarea
            ref={(node) => {
              props.prompt.textareaRef.current = node;
            }}
            value={props.prompt.value}
            onChange={(event) => props.prompt.setValue(event.currentTarget.value)}
            style={{ resize: 'none', marginBottom: 0 }}
          />
          <div
            className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize"
            onMouseDown={props.prompt.handleResizeStart}
          />
        </div>
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            disabled={props.prompt.isSaving}
            onClick={() => {
              void props.prompt.handleSave();
            }}
            className={aiProvidersSavePromptButtonClassName}
          >
            {translate(props.saveButtonKey)}
          </button>
        </div>
        {props.prompt.saveError ? (
          <p className="mt-2 text-sm text-[var(--sniptale-color-danger)]">
            {props.prompt.saveError}
          </p>
        ) : null}
      </div>
    </>
  );
}
