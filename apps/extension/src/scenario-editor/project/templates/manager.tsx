import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { translate } from '../../../platform/i18n';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { ProductDropdownMenu } from '@sniptale/ui/product-menus/dropdown';
import { ScenarioTemplateImportDialog } from './import-dialog';
import type { ScenarioEditorTemplateLibrary } from './types';

export function ScenarioTemplateManager(props: {
  libraries: ScenarioEditorTemplateLibrary[];
  onClose: () => void;
  onDeleteLibrary: (libraryId: string) => void;
  onSaveLibrary: (library: ScenarioEditorTemplateLibrary) => void;
  onToggleLibrary: (libraryId: string) => void;
}) {
  const [importOpen, setImportOpen] = useState(false);
  const closeImport = () => setImportOpen(false);

  return (
    <ProductDropdownMenu
      data-ui="scenario.templates.manager"
      className="grid max-h-[min(640px,calc(100vh-6rem))] w-[min(520px,calc(100vw-2rem))]
        gap-4 overflow-auto p-4"
    >
      <TemplateManagerHeader onOpenImport={() => setImportOpen(true)} />
      {importOpen ? (
        <ScenarioTemplateImportDialog
          onClose={closeImport}
          onSaveLibrary={(library) => {
            props.onSaveLibrary(library);
            closeImport();
          }}
        />
      ) : null}
      <TemplateLibraryList libraries={props.libraries} manager={props} />
      <ProductActionButton
        compact
        tone="secondary"
        className="justify-self-end"
        onClick={props.onClose}
      >
        {translate('scenario.editor.templateManagerClose')}
      </ProductActionButton>
    </ProductDropdownMenu>
  );
}

function TemplateManagerHeader(props: { onOpenImport: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-sm font-semibold text-[var(--sniptale-color-text-primary)]">
        {translate('scenario.editor.templateLibraries')}
      </h2>
      <button
        type="button"
        aria-label={translate('scenario.editor.importTemplateLibrary')}
        onClick={props.onOpenImport}
        className="inline-flex h-8 w-8 items-center justify-center rounded-[8px]
          text-[var(--sniptale-color-text-secondary)] hover:bg-[var(--sniptale-color-surface-hover)]"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}

function TemplateLibraryList(props: {
  libraries: ScenarioEditorTemplateLibrary[];
  manager: Pick<
    Parameters<typeof ScenarioTemplateManager>[0],
    'onDeleteLibrary' | 'onToggleLibrary'
  >;
}) {
  return (
    <div className="grid gap-2">
      {props.libraries.length === 0 ? (
        <div className="text-sm text-[var(--sniptale-color-text-muted)]">
          {translate('scenario.editor.noImportedTemplateLibraries')}
        </div>
      ) : null}
      {props.libraries.map((library) => (
        <LibraryRow key={library.id} library={library} manager={props.manager} />
      ))}
    </div>
  );
}

function LibraryRow(props: {
  library: ScenarioEditorTemplateLibrary;
  manager: Pick<
    Parameters<typeof ScenarioTemplateManager>[0],
    'onDeleteLibrary' | 'onToggleLibrary'
  >;
}) {
  return (
    <article
      className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-[8px] border
        border-[var(--sniptale-color-border-soft)] p-3"
    >
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-[var(--sniptale-color-text-primary)]">
          {props.library.name}
        </div>
        <div className="text-xs text-[var(--sniptale-color-text-muted)]">
          {props.library.templates.length} {translate('scenario.editor.templateLibraryCountSuffix')}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2 text-xs text-[var(--sniptale-color-text-muted)]">
          <input
            type="checkbox"
            checked={props.library.enabled}
            onChange={() => props.manager.onToggleLibrary(props.library.id)}
          />
          {translate('scenario.editor.enabled')}
        </label>
        <button
          type="button"
          aria-label={translate('scenario.editor.deleteTemplateLibrary')}
          onClick={() => props.manager.onDeleteLibrary(props.library.id)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-[8px]
            text-[var(--sniptale-color-text-secondary)] hover:bg-[var(--sniptale-color-surface-hover)]"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </article>
  );
}
