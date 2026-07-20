/**
 * Модальное окно выбора сохранения при действии «Выбор пресета».
 * Показывает подготовленные пути внутри Downloads и fallback на системный диалог.
 */

import { useState, useEffect } from 'react';
import { useAppLocale } from '../../../platform/i18n';
import type { ContentPrivilegedActionIntentSource } from '../../application/privileged-action-intent';
import { useSaveDialogPresets } from './presets';
import { SaveDialogContent, SaveDialogSessionFooter } from './views';

interface SaveDialogModalProps {
  dataUrl: string;
  defaultFilename: string;
  onSave: (
    actionType: 'download_default' | 'ask_system',
    presetId: string | null,
    filename: string,
    contentIntentSource?: ContentPrivilegedActionIntentSource | undefined
  ) => Promise<boolean>;
  onClose: () => void;
  onSessionDontAsk?: (presetId: string) => void;
}

function useSaveDialogHandlers(args: {
  dontAskInSession: boolean;
  filename: string;
  onClose: () => void;
  onSave: SaveDialogModalProps['onSave'];
  onSessionDontAsk?: (presetId: string) => void;
}) {
  const handlePreset = async (
    presetId: string,
    contentIntentSource?: ContentPrivilegedActionIntentSource | undefined
  ) => {
    const success = await args.onSave(
      'download_default',
      presetId,
      args.filename,
      contentIntentSource
    );
    if (!success) {
      return;
    }

    if (args.dontAskInSession && args.onSessionDontAsk) {
      args.onSessionDontAsk(presetId);
    }

    args.onClose();
  };

  const handleSystemDialog = async (
    contentIntentSource?: ContentPrivilegedActionIntentSource | undefined
  ) => {
    const success = await args.onSave('ask_system', null, args.filename, contentIntentSource);
    if (success) {
      args.onClose();
    }
  };

  return { handlePreset, handleSystemDialog };
}

export function SaveDialogModal({
  dataUrl: _dataUrl,
  defaultFilename,
  onSave,
  onClose,
  onSessionDontAsk,
}: SaveDialogModalProps) {
  useAppLocale();
  const { dontAskInSession, filename, sessionFooter, setFilename } = useSaveDialogViewState(
    defaultFilename,
    onSessionDontAsk
  );
  const { loading, loadError, presets } = useSaveDialogPresets();
  const { handlePreset, handleSystemDialog } = useSaveDialogHandlers({
    dontAskInSession,
    filename,
    onClose,
    onSave,
    ...(onSessionDontAsk === undefined ? {} : { onSessionDontAsk }),
  });

  return (
    <SaveDialogContent
      filename={filename}
      loading={loading}
      loadError={loadError}
      onChoosePreset={(presetId, contentIntentSource) => {
        void handlePreset(presetId, contentIntentSource ?? undefined);
      }}
      onChooseSystemFolder={(contentIntentSource) => {
        void handleSystemDialog(contentIntentSource ?? undefined);
      }}
      onClose={onClose}
      onFilenameChange={setFilename}
      presets={presets}
      sessionFooter={sessionFooter}
    />
  );
}

function useSaveDialogViewState(
  defaultFilename: string,
  onSessionDontAsk?: (presetId: string) => void
) {
  const [filename, setFilename] = useState(defaultFilename);
  const [dontAskInSession, setDontAskInSession] = useState(false);

  useEffect(() => {
    setFilename(defaultFilename);
  }, [defaultFilename]);

  return {
    dontAskInSession,
    filename,
    sessionFooter: onSessionDontAsk ? (
      <SaveDialogSessionFooter checked={dontAskInSession} onChange={setDontAskInSession} />
    ) : undefined,
    setFilename,
  };
}
