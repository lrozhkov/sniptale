import { createContext, useContext, useState } from 'react';
import { createPortal } from 'react-dom';
import { MaterialAudioRecordingModal } from '../../../composition/audio-recording/dialog';
import type { Translate } from '../../../platform/i18n';

/** Workspace-local placement only. Acquisition retains its destination and attachment intent. */
export const TourNarrationPlacement = createContext<{
  host: HTMLElement | null;
  setActive: (active: boolean) => void;
} | null>(null);

/** Captured target attachment stays in the scenario page; recorder session is shared with video. */
export function TourNarrationRecording({
  t,
  onClose,
  onApply,
  saveLabel,
}: {
  t: Translate;
  saveLabel?: string;
  onClose: () => void;
  onApply: (blob: Blob, signal: AbortSignal) => Promise<boolean>;
}) {
  const placement = useContext(TourNarrationPlacement);
  const [opener] = useState(() =>
    document.activeElement instanceof HTMLElement ? document.activeElement : null
  );
  if (!placement?.host) return null;
  return createPortal(
    <MaterialAudioRecordingModal
      isOpen
      presentation="inspector"
      returnFocusTo={opener}
      onClose={onClose}
      captureLimitSeconds={3600}
      title={t('scenario.editor.tourRecordAudio')}
      saveLabel={saveLabel ?? t('scenario.editor.tourAudioApply')}
      onSave={async (file, _trim, signal) => {
        if (!(await onApply(file, signal))) throw new Error('Narration attachment failed.');
      }}
    />,
    placement.host
  );
}
