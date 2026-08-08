import { translate } from '../../../../../platform/i18n';
import { ProductTextarea } from '@sniptale/ui/product-form-controls';
import { settingsModalFieldSurfaceClassName } from '../../../../section-surface/panel-controls';
import type { AiProvidersPromptViewState } from '../state/types';

const promptSaveButtonClassName = [
  'rounded-lg border bg-transparent px-4 py-2 text-sm font-medium',
  'border-[color:color-mix(in_srgb,var(--sniptale-color-accent)_28%,var(--sniptale-color-border-soft)_72%)]',
  'text-[var(--sniptale-color-text-primary)] transition-all',
  'hover:border-[var(--sniptale-color-border-accent-strong)]',
  'hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-accent-soft)_54%,transparent)]',
].join(' ');

interface AiProvidersPromptCardProps {
  descriptionKey:
    | 'settings.aiProviders.globalPromptDescription'
    | 'settings.aiProviders.scenarioEditorPromptDescription';
  prompt: AiProvidersPromptViewState;
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
            className={promptSaveButtonClassName}
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
