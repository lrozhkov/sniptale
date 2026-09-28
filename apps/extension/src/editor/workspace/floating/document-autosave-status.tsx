import { useState } from 'react';
import { AutosaveControl } from '@sniptale/ui/autosave-control';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { StaleImageWorkspaceError } from '../../../composition/persistence/image-aggregates';
import { translate } from '../../../platform/i18n';
import { useEditorController } from '../../application/controller-context';
import { useEditorStore } from '../../state/useEditorStore';
import { useImageDocumentOperations } from './document-bar';

/** Standalone image autosave keeps recovery beside history while persistence stays page-owned. */
export function DocumentAutosaveStatus() {
  const controller = useEditorController();
  const service = controller.autosaveService;
  const operations = useImageDocumentOperations();
  const saveState = useEditorStore((state) => state.saveState);
  const [enabled, setEnabled] = useState(() => service?.isEnabled() ?? true);
  const conflict = service?.getLastWriteError() instanceof StaleImageWorkspaceError;
  const presentationError = service?.hasPresentationError() ?? false;
  const presentationRetryBlocked = service?.isPresentationRetryBlocked() ?? false;
  const state = conflict
    ? 'conflict'
    : saveState === 'error'
      ? 'error'
      : saveState === 'idle'
        ? 'dirty'
        : saveState;
  return (
    <AutosaveControl
      enabled={enabled}
      state={state}
      openOnError
      onChange={(next) => {
        service?.setEnabled(next, () => controller.exportDocument());
        setEnabled(next);
      }}
      actions={
        conflict ? (
          <>
            <ProductActionButton
              compact
              tone="primary"
              disabled={operations.copyPending || operations.promotionState === 'saving'}
              aria-busy={operations.copyPending}
              onClick={() => void operations.saveConflictCopy().catch(() => undefined)}
            >
              {translate('editor.documentActions.saveCopy')}
            </ProductActionButton>
            <ProductActionButton
              compact
              tone="secondary"
              disabled={operations.copyPending || operations.promotionState === 'saving'}
              onClick={() => window.location.reload()}
            >
              {translate('editor.documentActions.reloadLatest')}
            </ProductActionButton>
          </>
        ) : presentationError ? (
          <ProductActionButton
            compact
            tone="primary"
            disabled={saveState === 'saving'}
            aria-busy={saveState === 'saving'}
            onClick={() => void service?.retryPresentation().catch(() => undefined)}
          >
            {translate('editor.documentActions.retryPreview')}
          </ProductActionButton>
        ) : null
      }
      labels={{
        title: translate('editor.documentActions.autosaveTitle'),
        switch: translate('editor.documentActions.autosaveSwitch'),
        on: translate('editor.documentActions.autosaveOnDescription'),
        off: translate('editor.documentActions.autosaveOffDescription'),
        paused: translate('editor.documentActions.autosaveOffStatus'),
        dirty: translate('common.states.dirty'),
        saving: translate('common.states.saving'),
        saved: translate('common.states.saved'),
        error: translate(
          presentationError
            ? 'gallery.app.previewUnavailable'
            : 'editor.documentActions.saveErrorTitle'
        ),
        errorDescription: translate(
          presentationError
            ? presentationRetryBlocked
              ? 'editor.documentActions.previewRequiresSavedDocument'
              : 'editor.documentActions.previewErrorDescription'
            : 'editor.documentActions.saveErrorDescription'
        ),
        conflict: translate('editor.documentActions.conflictDescription'),
        close: translate('common.actions.close'),
      }}
    />
  );
}
