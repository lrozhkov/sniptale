import { useEffect, useRef, useState } from 'react';
import { ProductSaveDialog } from '@sniptale/ui/product-save-dialog';
import { translate } from '../../../platform/i18n';
import type { EditorFloatingDocumentController } from './document-bar-types';

type SaveState = 'idle' | 'saving' | 'success' | 'error';

export function EditorSaveToFolderDialog(props: {
  controller: EditorFloatingDocumentController;
  defaultFilename: string;
  onClose: () => void;
}) {
  const [filename, setFilename] = useState(props.defaultFilename);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const savingRef = useRef(false);
  const closeTimerRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  useEffect(
    () => () => {
      mountedRef.current = false;
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    },
    []
  );

  const runSave = async (action: () => Promise<void> | void) => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaveState('saving');
    try {
      await action();
      if (!mountedRef.current) return;
      setSaveState('success');
      closeTimerRef.current = window.setTimeout(props.onClose, 450);
    } catch {
      if (!mountedRef.current) return;
      savingRef.current = false;
      setSaveState('error');
    }
  };

  return (
    <ProductSaveDialog
      title={translate('editor.documentActions.saveDialogTitle')}
      subtitle={translate('editor.documentActions.saveDialogSubtitle')}
      closeLabel={translate('common.actions.close')}
      filenameLabel={translate('editor.documentActions.saveDialogFilename')}
      filename={filename}
      disabled={saveState === 'saving' || saveState === 'success'}
      filenamePlaceholder={translate('editor.documentActions.saveDialogFilenamePlaceholder')}
      onFilenameChange={(value) => {
        setFilename(value);
        if (saveState === 'error') {
          savingRef.current = false;
          setSaveState('idle');
        }
      }}
      presetLabel={translate('editor.documentActions.saveDialogPresets')}
      presetCount={props.controller.savePresets.length}
      presetItems={props.controller.savePresets.map((preset) => ({
        id: preset.id,
        title: preset.name,
        path: `${translate('editor.documentActions.downloadsPrefix')} ${
          preset.path || translate('editor.documentActions.pathFallback')
        }`,
      }))}
      presetsEmptyState={translate('editor.documentActions.noSavePresets')}
      systemFolderLabel={translate('editor.documentActions.saveDialogSystemFolder')}
      systemFolderHint={translate('editor.documentActions.saveDialogSystemFolderHint')}
      onChoosePreset={(presetId) =>
        void runSave(() => props.controller.saveToPreset(presetId, { filename }))
      }
      onChooseSystemFolder={() => void runSave(() => props.controller.onSaveImageAs({ filename }))}
      onClose={props.onClose}
      footer={
        saveState === 'idle' ? null : (
          <div
            role={saveState === 'error' ? 'alert' : 'status'}
            className="text-sm text-[var(--sniptale-color-text-muted)]"
          >
            {translate(
              saveState === 'saving'
                ? 'common.states.saving'
                : saveState === 'success'
                  ? 'common.states.saved'
                  : 'editor.documentActions.saveDialogError'
            )}
          </div>
        )
      }
    />
  );
}
