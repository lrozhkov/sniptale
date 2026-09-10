import { useState } from 'react';
import { CircleAlert, X } from 'lucide-react';
import { EditorIconButton } from '@sniptale/ui/editor-chrome';
import { translate } from '../../../platform/i18n';
import { CatalogSection } from './catalog-section';
import { EffectImportControl } from './header';
import type { EffectLibraryOperationError } from './operations';
import type { VideoEditorEffectsLibraryDockProps } from './types';

const EFFECT_LIBRARY_DOCK_CLASS_NAME = 'relative flex h-full min-h-0 min-w-0';

export function VideoEditorEffectsLibraryDock(
  props: VideoEditorEffectsLibraryDockProps
): React.JSX.Element | null {
  const { disabled, operationError, run } = props.operations;
  const [dismissedError, setDismissedError] = useState<EffectLibraryOperationError | null>(null);
  if (!props.isOpen) return null;

  return (
    <aside data-ui="video-editor.effects-library.dock" className={EFFECT_LIBRARY_DOCK_CLASS_NAME}>
      <div className="flex h-full min-h-0 w-full flex-col">
        <div
          className="relative flex min-h-0 flex-1 flex-col"
          aria-busy={disabled || props.isLoading}
        >
          {props.isLoading && (
            <p
              role="status"
              className="px-1 text-xs leading-5 text-[var(--sniptale-color-text-muted)]"
            >
              {translate('videoEditor.effectsLibrary.catalogLoading')}
            </p>
          )}
          {props.errorCode && (
            <p role="alert" className="px-1 text-xs leading-5 text-[var(--sniptale-color-danger)]">
              {translate('videoEditor.effectsLibrary.catalogLoadFailed')}
            </p>
          )}
          <CatalogSection {...props} disabled={disabled} run={run} />
          {operationError && operationError !== dismissedError && (
            <div
              role="alert"
              className={[
                'absolute inset-x-2 bottom-2 z-20 flex items-start gap-2 rounded-[8px] border p-3',
                'border-[var(--sniptale-color-border-soft)]',
                'bg-[color:rgb(from_var(--sniptale-color-surface-panel)_r_g_b_/_1)]',
                'text-xs leading-5 text-[var(--sniptale-color-text-primary)] shadow-lg',
              ].join(' ')}
            >
              <CircleAlert
                size={16}
                aria-hidden="true"
                className="mt-0.5 shrink-0 text-[var(--sniptale-color-danger)]"
              />
              <p className="min-w-0 flex-1 break-words">{formatOperationError(operationError)}</p>
              <EditorIconButton
                title={translate('common.actions.close')}
                aria-label={translate('common.actions.close')}
                className="!h-6 !w-6 !min-w-6 shrink-0"
                onClick={() => setDismissedError(operationError)}
              >
                <X size={14} aria-hidden="true" />
              </EditorIconButton>
            </div>
          )}
        </div>
        <footer
          data-ui="video-editor.effects-library.footer"
          className="shrink-0 border-t border-[var(--sniptale-color-border-soft)] px-2 py-1"
        >
          <EffectImportControl disabled={disabled} onImport={props.onImportEffectFiles} run={run} />
        </footer>
      </div>
    </aside>
  );
}

function formatOperationError(error: EffectLibraryOperationError): string {
  if (error.code === 'effectTargetOccupied')
    return translate('videoEditor.effectsLibrary.targetOccupied');
  const message =
    error.kind === 'import'
      ? translate('videoEditor.effectsLibrary.importFailed')
      : error.kind === 'apply'
        ? translate('videoEditor.effectsLibrary.applyFailed')
        : error.kind === 'delete'
          ? translate('videoEditor.effectsLibrary.deleteFailed')
          : translate('videoEditor.effectsLibrary.updateFailed');
  return message;
}
