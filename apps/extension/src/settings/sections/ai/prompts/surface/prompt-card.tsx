import { translate } from '../../../../../platform/i18n';
import { ProductTextarea } from '@sniptale/ui/product-form-controls';
import { getControlSecondaryButtonClassName } from '@sniptale/ui/control-language';
import { RotateCcw } from 'lucide-react';
import { settingsModalFieldSurfaceClassName } from '../../../../section-surface/panel-controls';
import type { AiProvidersPromptViewState } from '../state/types';

interface AiProvidersPromptCardProps {
  descriptionKey:
    | 'settings.aiProviders.globalPromptDescription'
    | 'settings.aiProviders.scenarioEditorPromptDescription';
  prompt: AiProvidersPromptViewState;
  titleKey:
    | 'settings.aiProviders.globalPromptTitle'
    | 'settings.aiProviders.scenarioEditorPromptTitle';
}

export function AIProvidersPromptCard(props: AiProvidersPromptCardProps) {
  return (
    <>
      <h2 className="text-sm font-semibold text-[var(--sniptale-color-text-primary)]">
        {translate(props.titleKey)}
      </h2>
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
        <div className="mt-3 flex justify-end gap-2">
          {props.prompt.status.canReset ? (
            <button
              type="button"
              aria-label={translate('settings.aiProviders.globalPromptResetButton')}
              title={translate('settings.aiProviders.globalPromptResetButton')}
              disabled={props.prompt.status.isSaving}
              onClick={() => {
                void props.prompt.handleReset();
              }}
              className={getControlSecondaryButtonClassName({ density: 'compact' })}
            >
              <RotateCcw aria-hidden="true" size={15} />
            </button>
          ) : null}
          <button
            type="button"
            disabled={props.prompt.status.isSaving || !props.prompt.status.isDirty}
            onClick={() => {
              void props.prompt.handleSave();
            }}
            className={getControlSecondaryButtonClassName({ density: 'compact' })}
          >
            {translate('common.actions.save')}
          </button>
        </div>
        {props.prompt.status.saveError ? (
          <p className="mt-2 text-sm text-[var(--sniptale-color-danger)]">
            {props.prompt.status.saveError}
          </p>
        ) : null}
      </div>
    </>
  );
}
