import { X } from 'lucide-react';
import { translate } from '../../../platform/i18n';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { ProductTextarea } from '@sniptale/ui/product-form-controls';
import { createScenarioV3Id } from '../../../features/scenario/project/v3';
import type { ScenarioTemplateDefinition } from '@sniptale/runtime-contracts/scenario/types/v3';
import { ScenarioTemplateImportResults } from './import-results';
import { useScenarioTemplateImportState } from './use-import-state';
import type { ScenarioEditorTemplateLibrary } from './types';

export function ScenarioTemplateImportDialog(props: {
  onClose: () => void;
  onSaveLibrary: (library: ScenarioEditorTemplateLibrary) => void;
}) {
  const state = useScenarioTemplateImportState();
  const canSave = Boolean(state.result?.libraryName && state.result.acceptedTemplates.length > 0);

  return (
    <div
      data-ui="scenario.templates.import-dialog"
      className="grid gap-4 rounded-[8px] border border-[var(--sniptale-color-border-soft)]
        bg-[var(--sniptale-color-surface-panel)] p-4"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--sniptale-color-text-primary)]">
          {translate('scenario.editor.importTemplateLibraryTitle')}
        </h3>
        <button
          type="button"
          aria-label={translate('scenario.editor.templateManagerClose')}
          onClick={props.onClose}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <ProductTextarea
        value={state.text}
        onChange={(event) => state.validateText(event.currentTarget.value)}
        placeholder={translate('scenario.editor.importTemplatePackPlaceholder')}
      />
      <ScenarioTemplateImportResults error={state.error} result={state.result} />
      <ProductActionButton
        compact
        disabled={!canSave}
        onClick={() => {
          if (state.result?.libraryName) {
            props.onSaveLibrary(
              createImportedLibrary(state.result.libraryName, state.result.acceptedTemplates)
            );
          }
        }}
        className="justify-self-end"
      >
        {translate('scenario.editor.saveTemplateLibrary')}
      </ProductActionButton>
    </div>
  );
}

function createImportedLibrary(
  name: string,
  templates: ScenarioTemplateDefinition[]
): ScenarioEditorTemplateLibrary {
  const now = Date.now();

  return {
    createdAt: now,
    enabled: true,
    id: createScenarioV3Id('template-library'),
    name,
    templates,
    updatedAt: now,
  };
}
